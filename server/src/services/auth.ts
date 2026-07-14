import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { makeStarterHotbar } from '@shared/inventory';
import { prisma } from './db.js';
import { verifySignIn } from './siwe.js';

/**
 * WALLET-ONLY AUTH (W2). Sign-In-With-Ethereum (EIP-4361) is the ONE front
 * door: {@link authenticateWallet} verifies a real signature (siwe.ts, no
 * token / no RPC needed) and finds-or-creates the account keyed by the
 * lowercased wallet address. A brand-new wallet gets a placeholder Spark with
 * an unchosen appearance, so the creator (W6) opens on first entry.
 *
 * The legacy email/password + guest helpers below are removed in W4; they are
 * kept here only so this commit builds while the SIWE path lands.
 */

const JWT_SECRET = process.env.JWT_SECRET ?? 'amperia-dev-secret-change-me';
const TOKEN_TTL = '7d';
const BCRYPT_ROUNDS = 10;

export interface JoinedAuth {
  accountId: string;
  characterId: string;
}

export interface AuthResult {
  token: string;
  sparkName: string;
  /** The signed-in wallet (lowercased), or null for a legacy account. */
  walletAddress: string | null;
  /** Last persisted district — the client rejoins the Spark where they left. */
  district: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_RE = /^[A-Za-z0-9 _-]{3,20}$/;

function signToken(auth: JoinedAuth): string {
  return jwt.sign(auth, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

export function verifyToken(token: string): JoinedAuth {
  const payload = jwt.verify(token, JWT_SECRET);
  if (
    typeof payload !== 'object' ||
    payload === null ||
    typeof (payload as Record<string, unknown>).accountId !== 'string' ||
    typeof (payload as Record<string, unknown>).characterId !== 'string'
  ) {
    throw new Error('Malformed token');
  }
  const p = payload as unknown as JoinedAuth;
  return { accountId: p.accountId, characterId: p.characterId };
}

async function createAccountWithCharacter(
  email: string | null,
  passwordHash: string | null,
  sparkName: string,
): Promise<AuthResult> {
  const account = await prisma.account.create({
    data: {
      email,
      passwordHash,
      character: {
        create: { sparkName, hotbarJson: makeStarterHotbar().slots as object[] },
      },
    },
    include: { character: true },
  });
  const character = account.character;
  if (character === null) throw new Error('Character creation failed');
  return {
    token: signToken({ accountId: account.id, characterId: character.id }),
    sparkName: character.sparkName,
    walletAddress: account.walletAddress,
    district: character.district,
  };
}

export function validSparkName(name: string): boolean {
  return NAME_RE.test(name.trim());
}

export async function registerEmail(
  email: string,
  password: string,
  sparkName: string,
): Promise<AuthResult> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = sparkName.trim();
  if (!EMAIL_RE.test(cleanEmail)) throw new Error('That email does not look right.');
  if (password.length < 8) throw new Error('Password needs at least 8 characters.');
  if (!validSparkName(cleanName)) {
    throw new Error('Spark names are 3-20 letters, numbers, spaces, - or _.');
  }
  const existingEmail = await prisma.account.findUnique({ where: { email: cleanEmail } });
  if (existingEmail !== null) throw new Error('That email is already registered.');
  const existingName = await prisma.character.findUnique({ where: { sparkName: cleanName } });
  if (existingName !== null) throw new Error('That Spark name is taken.');
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  return createAccountWithCharacter(cleanEmail, hash, cleanName);
}

export async function loginEmail(email: string, password: string): Promise<AuthResult> {
  const cleanEmail = email.trim().toLowerCase();
  const account = await prisma.account.findUnique({
    where: { email: cleanEmail },
    include: { character: true },
  });
  if (account === null || account.passwordHash === null || account.character === null) {
    throw new Error('Unknown email or wrong password.');
  }
  const ok = await bcrypt.compare(password, account.passwordHash);
  if (!ok) throw new Error('Unknown email or wrong password.');
  return {
    token: signToken({ accountId: account.id, characterId: account.character.id }),
    sparkName: account.character.sparkName,
    walletAddress: account.walletAddress,
    district: account.character.district,
  };
}

export async function guestJoin(requestedName: string | undefined): Promise<AuthResult> {
  let name = (requestedName ?? '').trim();
  if (name !== '' && !validSparkName(name)) {
    throw new Error('Spark names are 3-20 letters, numbers, spaces, - or _.');
  }
  if (name === '') {
    name = `Spark-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }
  const taken = await prisma.character.findUnique({ where: { sparkName: name } });
  if (taken !== null) {
    if (requestedName !== undefined && requestedName !== '') {
      throw new Error('That Spark name is taken.');
    }
    name = `${name}${Math.floor(Math.random() * 90 + 10)}`;
  }
  return createAccountWithCharacter(null, null, name);
}

/** A newly seated wallet Spark carries a placeholder name until the creator. */
const PLACEHOLDER_NAME = (): string => `Spark-${randomBytes(3).toString('hex')}`;

/**
 * Create the account + its one placeholder Spark for a fresh wallet. The name
 * is a throwaway (`Spark-xxxxxx`) that the creator (W6) overwrites on first
 * entry; appearance is left unset so the identity snapshot pops the creator.
 * Retries on the rare placeholder-name collision; on a concurrent same-wallet
 * race the caller re-fetches.
 */
async function seatWalletSpark(walletAddress: string): Promise<AuthResult> {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const account = await prisma.account.create({
        data: {
          walletAddress,
          character: {
            create: { sparkName: PLACEHOLDER_NAME(), hotbarJson: makeStarterHotbar().slots as object[] },
          },
        },
        include: { character: true },
      });
      if (account.character === null) throw new Error('Character creation failed');
      return resultFor(account.walletAddress, account.id, account.character);
    } catch (err) {
      const code = (err as { code?: string }).code;
      const target = (err as { meta?: { target?: string[] } }).meta?.target ?? [];
      if (code === 'P2002' && target.includes('sparkName')) continue; // name clash → retry
      if (code === 'P2002' && target.includes('walletAddress')) break; // raced → re-fetch
      throw err;
    }
  }
  const raced = await prisma.account.findUnique({
    where: { walletAddress },
    include: { character: true },
  });
  if (raced?.character != null) return resultFor(raced.walletAddress, raced.id, raced.character);
  throw new Error('Could not seat a new Spark — reconnect and try again.');
}

function resultFor(
  walletAddress: string | null,
  accountId: string,
  character: { id: string; sparkName: string; district: string },
): AuthResult {
  return {
    token: signToken({ accountId, characterId: character.id }),
    sparkName: character.sparkName,
    walletAddress,
    district: character.district,
  };
}

/**
 * THE login (W2): verify a Sign-In-With-Ethereum signature, then find-or-create
 * the account keyed by the lowercased wallet address and hand back a session
 * token. Needs no token address and no RPC — it works before $AMP exists. Hold
 * mode adds a balance gate around this in W3; connect mode plays on any valid
 * sign-in.
 */
export async function authenticateWallet(message: string, signature: string): Promise<AuthResult> {
  const { address } = await verifySignIn(message, signature); // real SIWE; lowercased
  const existing = await prisma.account.findUnique({
    where: { walletAddress: address },
    include: { character: true },
  });
  if (existing?.character != null) {
    return resultFor(existing.walletAddress, existing.id, existing.character);
  }
  return seatWalletSpark(address);
}

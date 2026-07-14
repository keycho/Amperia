import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { makeStarterHotbar } from '@shared/inventory';
import { prisma } from './db.js';
import { isEvmAddress, verifySiwe } from './tokenGate.js';

/**
 * Accounts start on the guest/demo path (no wallet needed to try the city).
 * Guests are real accounts without an email so they can upgrade later. SIWE
 * (Sign-In-With-Ethereum) wallet linking is the front door to the 1,000-$AMP
 * token gate (M4) — optional and late; the endpoint exists but stays inactive
 * until AMP_TOKEN_ADDRESS is set (see tokenGate.ts).
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
  email: string | null;
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
    email: account.email,
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
    email: account.email,
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

/**
 * SIWE (Sign-In-With-Ethereum, EIP-4361) wallet linking — optional and late by
 * design (M4). The signed message must embed the account id (prevents replaying
 * another account's signature). Signature verification runs through the token
 * gate (`tokenGate.verifySiwe`), which is **inactive until AMP_TOKEN_ADDRESS is
 * set** — so this endpoint shape-checks the request, then throws
 * NotActivated until the token launches. The guest/demo path is unaffected.
 */
export async function linkWallet(
  accountId: string,
  walletAddress: string,
  message: string,
  signature: string,
): Promise<void> {
  if (!message.includes(accountId)) {
    throw new Error('Signed message must reference this account.');
  }
  if (!isEvmAddress(walletAddress)) {
    throw new Error('Malformed wallet address.');
  }
  // EIP-4361 verification (stub until the token gate is activated — no live
  // chain call). Returns the recovered address; must match the claimed wallet.
  const recovered = await verifySiwe({ address: walletAddress, message, signature });
  if (recovered.toLowerCase() !== walletAddress.toLowerCase()) {
    throw new Error('Signature does not verify.');
  }
  const existing = await prisma.account.findUnique({ where: { walletAddress } });
  if (existing !== null && existing.id !== accountId) {
    throw new Error('That wallet is linked to another Spark.');
  }
  await prisma.account.update({ where: { id: accountId }, data: { walletAddress } });
}

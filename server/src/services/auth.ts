import bcrypt from 'bcryptjs';
import bs58 from 'bs58';
import jwt from 'jsonwebtoken';
import nacl from 'tweetnacl';
import { prisma } from './db.js';

/**
 * Accounts are email-first (the full free game needs no wallet — CLAUDE.md).
 * Guests are real accounts without an email so they can upgrade later.
 * SIWS wallet linking is optional and late; the endpoint exists but nothing
 * in the game requires it.
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
        create: { sparkName },
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
 * SIWS (Sign-In-With-Solana) wallet linking — optional and late by design.
 * The signed message must embed the account id (prevents replaying another
 * account's signature). Hardening (nonce store, expiry) comes with M4.
 */
export async function linkWallet(
  accountId: string,
  walletAddress: string,
  message: string,
  signatureBase58: string,
): Promise<void> {
  if (!message.includes(accountId)) {
    throw new Error('Signed message must reference this account.');
  }
  let pubkey: Uint8Array;
  let signature: Uint8Array;
  try {
    pubkey = bs58.decode(walletAddress);
    signature = bs58.decode(signatureBase58);
  } catch {
    throw new Error('Malformed wallet address or signature.');
  }
  if (pubkey.length !== 32) throw new Error('Malformed wallet address.');
  const ok = nacl.sign.detached.verify(new TextEncoder().encode(message), signature, pubkey);
  if (!ok) throw new Error('Signature does not verify.');
  const existing = await prisma.account.findUnique({ where: { walletAddress } });
  if (existing !== null && existing.id !== accountId) {
    throw new Error('That wallet is linked to another Spark.');
  }
  await prisma.account.update({ where: { id: accountId }, data: { walletAddress } });
}

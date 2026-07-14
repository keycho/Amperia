import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { makeStarterHotbar } from '@shared/inventory';
import { prisma } from './db.js';
import { verifySignIn } from './siwe.js';
import { runHoldGate } from './tokenGate.js';

/**
 * WALLET-ONLY AUTH (W2–W4). Sign-In-With-Ethereum (EIP-4361) is the ONLY front
 * door — there is no email, no password, no playable guest. The wallet address
 * IS the account identity (unique, lowercased). {@link authenticateWallet}
 * verifies a real signature (siwe.ts, no token / no RPC needed) and
 * finds-or-creates the account; a brand-new wallet gets a placeholder Spark
 * with an unchosen appearance so the creator (W6) opens on first entry.
 *
 * The no-wallet option is spectate (W7) — read-only, no account, no session
 * token — handled at the room, not here.
 */

const JWT_SECRET = process.env.JWT_SECRET ?? 'amperia-dev-secret-change-me';
const TOKEN_TTL = '7d';

export interface JoinedAuth {
  accountId: string;
  characterId: string;
}

export interface AuthResult {
  token: string;
  sparkName: string;
  /** The signed-in wallet (lowercased) — the account identity. */
  walletAddress: string;
  /** Last persisted district — the client rejoins the Spark where they left. */
  district: string;
}

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

export function validSparkName(name: string): boolean {
  return NAME_RE.test(name.trim());
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
  walletAddress: string,
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
  // W3: in hold mode, a valid sign-in is not enough — the wallet must also hold
  // >= 1,000 $AMP (with 24h grace). A no-op in connect mode and while hold mode
  // is inert (no token deployed). Runs BEFORE any account is seated, so a
  // gated-out wallet never creates a Spark.
  await runHoldGate(address);
  const existing = await prisma.account.findUnique({
    where: { walletAddress: address },
    include: { character: true },
  });
  if (existing?.character != null) {
    return resultFor(existing.walletAddress, existing.id, existing.character);
  }
  return seatWalletSpark(address);
}

import { randomBytes } from 'node:crypto';
import { recoverMessageAddress } from 'viem';
import { parseSiweMessage } from '@shared/siwe';
import { isEvmAddress } from './tokenGate.js';

/**
 * SIWE VERIFICATION (W2) — the only login. REAL, not a stub.
 *
 * Flow: the server issues a single-use {@link issueNonce}; the client folds it
 * into an EIP-4361 message (shared `formatSiweMessage`), has the wallet
 * `personal_sign` it, and posts `{ message, signature }`. {@link verifySignIn}
 * re-parses the message, verifies the signature recovers to the claimed
 * address (viem, local EC-recover — NO RPC, NO token address), and burns the
 * nonce. This works before $AMP even exists — that is the whole point.
 *
 * The nonce store is in-process (single-use, 10-min TTL). Good for the single
 * HTTP front-door we run today; a multi-instance deploy would move it to Redis
 * (the seam is {@link issueNonce}/{@link consumeNonce}).
 */

const NONCE_TTL_MS = 10 * 60_000;

/** nonce -> expiry ms. Single-use: {@link consumeNonce} deletes on read. */
const nonces = new Map<string, number>();

/** Issue a fresh single-use nonce (16 random bytes, hex). */
export function issueNonce(now: number = Date.now()): string {
  // Opportunistic sweep so an idle process does not accrete dead nonces.
  if (nonces.size > 512) {
    for (const [n, exp] of nonces) if (exp <= now) nonces.delete(n);
  }
  const nonce = randomBytes(16).toString('hex');
  nonces.set(nonce, now + NONCE_TTL_MS);
  return nonce;
}

/** Consume a nonce: true only if it was issued, unexpired, and unused. */
export function consumeNonce(nonce: string, now: number = Date.now()): boolean {
  const exp = nonces.get(nonce);
  if (exp === undefined) return false;
  nonces.delete(nonce); // single-use regardless of freshness
  return exp > now;
}

/**
 * PURE verify: does `signature` over `message` recover to `expectedAddress`?
 * (message + signature + expected address → valid). No network for an EOA —
 * viem does local EC-recover of the EIP-191 personal-sign digest.
 */
export async function verifySiweSignature(
  message: string,
  signature: string,
  expectedAddress: string,
): Promise<boolean> {
  if (!/^0x[0-9a-fA-F]+$/.test(signature)) return false;
  try {
    const recovered = await recoverMessageAddress({
      message,
      signature: signature as `0x${string}`,
    });
    return recovered.toLowerCase() === expectedAddress.toLowerCase();
  } catch {
    return false;
  }
}

/** A verified sign-in — the wallet, always lowercased (the account identity). */
export interface SignIn {
  address: string;
}

/**
 * Verify a full sign-in: parse the message, confirm the signature, then burn
 * the nonce. Throws a copy-safe error on any failure. Order matters — the
 * signature is checked BEFORE the nonce is consumed, so a mis-sign does not
 * waste a good nonce, while a replay of a valid `{message,signature}` is still
 * refused (the nonce is already gone).
 */
export async function verifySignIn(
  message: string,
  signature: string,
  now: number = Date.now(),
): Promise<SignIn> {
  const fields = parseSiweMessage(message);
  if (fields === null) throw new Error('That sign-in message was malformed.');
  if (!isEvmAddress(fields.address)) {
    throw new Error('That sign-in message named an invalid wallet.');
  }
  const ok = await verifySiweSignature(message, signature, fields.address);
  if (!ok) throw new Error('Signature does not verify.');
  if (!consumeNonce(fields.nonce, now)) {
    throw new Error('That sign-in has expired — reconnect your wallet.');
  }
  return { address: fields.address.toLowerCase() };
}

import { CHAIN_ENV, TOKEN_GATE } from '@shared/chain';

/**
 * M4 — THE $AMP TOKEN GATE (EVM). Interface + STUB.
 *
 * The front door: a Spark proves control of a wallet via **Sign-In-With-
 * Ethereum** (EIP-4361), then the server reads that wallet's $AMP balance via
 * ERC-20 `balanceOf` against `ROBINHOOD_RPC_URL`. Balance ≥ 1,000 × 10^18 ⇒
 * the Charged key. It is **server-authoritative** (never client-reported),
 * re-checked on login and periodically; a dip below the threshold opens a
 * **24h grace** window with an in-game warning — never an instant boot. The
 * **guest/demo** path is unaffected: no wallet, no gate, full trial.
 *
 * NOT ACTIVATED. No token is deployed (`AMP_TOKEN_ADDRESS` is unset), and this
 * module performs **no live chain call**. The two live seams — {@link verifySiwe}
 * and {@link readAmpBalance} — throw {@link TokenGateNotActivatedError} until
 * they are wired with viem and the address exists. The pure decision logic
 * ({@link holdsKey}, {@link decideAccess}) is complete and unit-tested now.
 */

/** Thrown by the live seams until the gate is wired + `AMP_TOKEN_ADDRESS` set. */
export class TokenGateNotActivatedError extends Error {
  constructor(what: string) {
    super(`Token gate not activated: ${what} awaits AMP_TOKEN_ADDRESS + viem wiring (M4).`);
    this.name = 'TokenGateNotActivatedError';
  }
}

export interface GateEnv {
  rpcUrl: string | undefined;
  tokenAddress: string | undefined;
}

/** Read the gate's env (VALUES are secrets/addresses; only NAMES live in config). */
export function readGateEnv(): GateEnv {
  return {
    rpcUrl: process.env[CHAIN_ENV.rpcUrl],
    tokenAddress: process.env[CHAIN_ENV.tokenAddress],
  };
}

/** The gate goes live only once the token exists AND an RPC is configured. */
export function gateActive(env: GateEnv = readGateEnv()): boolean {
  return (
    typeof env.tokenAddress === 'string' &&
    env.tokenAddress.length > 0 &&
    typeof env.rpcUrl === 'string' &&
    env.rpcUrl.length > 0
  );
}

/** A 0x EVM address, shape-checked (checksum validation happens in viem later). */
export function isEvmAddress(a: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(a);
}

/** Pure: does a raw base-unit balance meet the 1,000-$AMP key threshold? */
export function holdsKey(balanceBase: bigint): boolean {
  return balanceBase >= TOKEN_GATE.minTokensBase;
}

// ── the grace state machine (pure, testable, no chain, no clock) ──────────

/** Persisted per linked wallet between checks. */
export type GateState =
  | { kind: 'none' } // guest / never held the key
  | { kind: 'held'; sinceMs: number } // currently holds the key
  | { kind: 'dipped'; sinceMs: number }; // below threshold, inside the grace window

/** 'charged' = holds the key · 'grace' = dipped, warned, still in · 'denied'
 *  = not Charged (guest/demo access only — NOT a ban, play is never blocked). */
export type GateAccess = 'charged' | 'grace' | 'denied';

export interface GateDecision {
  access: GateAccess;
  /** Surface the in-game "your key is slipping" warning this tick. */
  warn: boolean;
  /** When grace expires (grace only; null otherwise). */
  graceUntilMs: number | null;
  /** Next state to persist. */
  state: GateState;
}

const GRACE_MS = TOKEN_GATE.graceHours * 3_600_000;

/**
 * Decide access from a fresh balance read + the last persisted state. Never an
 * instant boot: a holder who dips gets a {@link TOKEN_GATE.graceHours}-hour
 * grace (measured from when the dip is first detected) with a warning first;
 * topping back up any time inside the window restores Charged immediately.
 */
export function decideAccess(balanceBase: bigint, nowMs: number, prev: GateState): GateDecision {
  if (holdsKey(balanceBase)) {
    const since = prev.kind === 'held' ? prev.sinceMs : nowMs;
    return { access: 'charged', warn: false, graceUntilMs: null, state: { kind: 'held', sinceMs: since } };
  }
  // Below the threshold.
  if (prev.kind === 'none') {
    // Never held the key — simply a (wallet-linked) guest. No revoke drama.
    return { access: 'denied', warn: false, graceUntilMs: null, state: { kind: 'none' } };
  }
  const dipSince = prev.kind === 'dipped' ? prev.sinceMs : nowMs;
  const graceUntilMs = dipSince + GRACE_MS;
  if (nowMs < graceUntilMs) {
    return { access: 'grace', warn: true, graceUntilMs, state: { kind: 'dipped', sinceMs: dipSince } };
  }
  return { access: 'denied', warn: false, graceUntilMs, state: { kind: 'none' } };
}

// ── the live seams (STUBS until AMP_TOKEN_ADDRESS + viem) ─────────────────

export interface SiweRequest {
  /** The wallet claiming access. */
  address: string;
  /** The EIP-4361 message the wallet signed (must embed the account id). */
  message: string;
  /** The signature over `message`. */
  signature: string;
}

/**
 * Verify a Sign-In-With-Ethereum (EIP-4361) message + signature and return the
 * recovered address. LIVE (when the token launches), with viem:
 *
 *   const ok = await publicClient.verifyMessage({ address, message, signature });
 *   if (!ok) throw new Error('Signature does not verify.');
 *   return address;
 *
 * against `ROBINHOOD_RPC_URL`. Stub until then.
 */
export async function verifySiwe(_req: SiweRequest): Promise<string> {
  throw new TokenGateNotActivatedError('SIWE verification');
}

/**
 * Read a wallet's $AMP balance in base units via ERC-20 `balanceOf`. LIVE:
 *
 *   publicClient.readContract({ address: AMP_TOKEN_ADDRESS, abi: erc20Abi,
 *     functionName: 'balanceOf', args: [wallet] })  // → bigint, base units
 *
 * against `ROBINHOOD_RPC_URL`. Stub until `AMP_TOKEN_ADDRESS` is set.
 */
export async function readAmpBalance(_wallet: string): Promise<bigint> {
  throw new TokenGateNotActivatedError('balanceOf');
}

/**
 * The front-door check (server-authoritative): verify SIWE → read balance →
 * decide access with grace. Inert while the gate is inactive — callers fall
 * back to the guest/demo path (play is never blocked). Pass `nowMs` (and the
 * wallet's persisted {@link GateState}) so the decision stays testable.
 */
export async function checkGate(
  req: SiweRequest,
  nowMs: number,
  prev: GateState,
): Promise<GateDecision> {
  if (!gateActive()) {
    // No token address yet ⇒ everyone is a guest; nothing is gated.
    return { access: 'denied', warn: false, graceUntilMs: null, state: { kind: 'none' } };
  }
  const address = await verifySiwe(req); // stub throws until wired
  const balance = await readAmpBalance(address); // stub throws until wired
  return decideAccess(balance, nowMs, prev);
}

import { createPublicClient, erc20Abi, getAddress, http } from 'viem';
import { CHAIN_ENV, resolveGateMode, TOKEN_GATE, type GateMode } from '@shared/chain';

/**
 * THE $AMP TOKEN GATE (EVM) — the balance half of hold mode (W3).
 *
 * Sign-in itself is SIWE-only and lives in `siwe.ts` (real, needs no token).
 * This module is the SECOND check that runs ONLY when `GATE_MODE=hold`: after a
 * valid sign-in, read the wallet's $AMP balance via ERC-20 `balanceOf` against
 * `ROBINHOOD_RPC_URL` and require ≥ 1,000 × 10^18. It is **server-authoritative**
 * (never client-reported); a dip below the threshold opens a **24h grace**
 * window with an in-game warning — never an instant boot. In `connect` mode the
 * balance is never read and this module stays dormant.
 *
 * INERT until the token exists. No token is deployed (`AMP_TOKEN_ADDRESS` is
 * unset), so the one live seam — {@link readAmpBalance} — throws
 * {@link TokenGateNotActivatedError} until wired with viem and the address is
 * set. The pure decision logic ({@link holdsKey}, {@link decideAccess}) is
 * complete and unit-tested now.
 */

/** Thrown by the live seam until the gate is wired + `AMP_TOKEN_ADDRESS` set. */
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

// ── the live seam (wired, but INERT until AMP_TOKEN_ADDRESS + RPC exist) ───

/**
 * Read a wallet's $AMP balance in base units via ERC-20 `balanceOf` against
 * `ROBINHOOD_RPC_URL`. The viem call is real; it just never runs until the
 * gate is active (no token deployed), so it throws {@link TokenGateNotActivatedError}
 * while inert. {@link runHoldGate} only calls it once {@link gateActive}.
 */
export async function readAmpBalance(wallet: string): Promise<bigint> {
  const env = readGateEnv();
  if (!gateActive(env)) throw new TokenGateNotActivatedError('balanceOf');
  const client = createPublicClient({ transport: http(env.rpcUrl) });
  return client.readContract({
    // `env.tokenAddress` is present (gateActive guaranteed it).
    address: getAddress(env.tokenAddress as string),
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [getAddress(wallet)],
  });
}

// ── hold mode: the balance gate around a valid sign-in (W3) ────────────────

/** The live gate mode, from the `GATE_MODE` env var (default 'connect'). */
export function gateMode(): GateMode {
  return resolveGateMode(process.env[CHAIN_ENV.gateMode]);
}

/** Both a holder ('charged') and a warned-but-still-in dip ('grace') may play;
 *  only 'denied' blocks. Grace is never an instant boot. */
export function holdAllows(access: GateAccess): boolean {
  return access === 'charged' || access === 'grace';
}

/** Injectable dependencies so the gate decision is unit-testable with a mocked
 *  balance + clock (no env, no RPC). */
export interface HoldGateDeps {
  mode: GateMode;
  /** Whether the token gate is live (token address + RPC configured). */
  active: boolean;
  readBalance: (wallet: string) => Promise<bigint>;
  loadState: (wallet: string) => GateState;
  saveState: (wallet: string, state: GateState) => void;
  nowMs: number;
}

export interface HoldGateResult {
  allowed: boolean;
  warn: boolean;
  access: GateAccess;
}

/**
 * PURE-CORE hold gate. In `connect` mode — or in `hold` mode while the gate is
 * inert (no token deployed) — it permits play without ever reading a balance.
 * In active `hold` mode it reads `balanceOf`, runs the 24h-grace decision, and
 * persists the next state. This is the seam the checkpoint drives with a mocked
 * balance: ≥ 1,000 $AMP passes, < 1,000 is blocked, a dip enters grace.
 */
export async function evaluateHoldGate(
  wallet: string,
  deps: HoldGateDeps,
): Promise<HoldGateResult> {
  if (deps.mode !== 'hold' || !deps.active) {
    // connect mode, or hold configured but inert until the token exists.
    return { allowed: true, warn: false, access: 'charged' };
  }
  const balance = await deps.readBalance(wallet);
  const decision = decideAccess(balance, deps.nowMs, deps.loadState(wallet));
  deps.saveState(wallet, decision.state);
  return { allowed: holdAllows(decision.access), warn: decision.warn, access: decision.access };
}

/**
 * Per-wallet grace state between checks. In-memory for now: hold mode is inert
 * until a token is deployed, so nothing durable is at stake yet. When hold mode
 * goes live this is the ONE seam to move to Redis/DB (loadState/saveState).
 */
const holdGateStates = new Map<string, GateState>();

/** Message shown when a hold-mode wallet lacks the key (comms-clean). */
export class HoldGateError extends Error {
  constructor() {
    super('This wallet holds under 1,000 $AMP — hold the key to play.');
    this.name = 'HoldGateError';
  }
}

/**
 * Run the hold gate around a just-verified wallet during login. A no-op in
 * connect mode and while hold mode is inert; in active hold mode it throws
 * {@link HoldGateError} when the wallet is below the threshold past its grace.
 */
export async function runHoldGate(wallet: string, nowMs: number = Date.now()): Promise<void> {
  const result = await evaluateHoldGate(wallet, {
    mode: gateMode(),
    active: gateActive(),
    readBalance: readAmpBalance,
    loadState: (w) => holdGateStates.get(w) ?? { kind: 'none' },
    saveState: (w, s) => {
      holdGateStates.set(w, s);
    },
    nowMs,
  });
  if (!result.allowed) throw new HoldGateError();
}

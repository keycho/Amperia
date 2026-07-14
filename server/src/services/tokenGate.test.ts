import { describe, expect, it } from 'vitest';
import { TOKEN_GATE } from '@shared/chain';
import {
  decideAccess,
  gateActive,
  holdsKey,
  isEvmAddress,
  readAmpBalance,
  type GateState,
} from './tokenGate.js';

const H = TOKEN_GATE.minTokensBase; // 1,000 × 10^18
const HOUR = 3_600_000;

describe('token gate — thresholds + activation', () => {
  it('holds the key at exactly 1,000 $AMP, not a wei below', () => {
    expect(holdsKey(H)).toBe(true);
    expect(holdsKey(H - 1n)).toBe(false);
    expect(holdsKey(H + 1n)).toBe(true);
    expect(holdsKey(0n)).toBe(false);
  });

  it('shape-checks EVM addresses', () => {
    expect(isEvmAddress(`0x${'0'.repeat(40)}`)).toBe(true);
    expect(isEvmAddress(`0x${'A'.repeat(40)}`)).toBe(true);
    expect(isEvmAddress('0xabc')).toBe(false);
    expect(isEvmAddress('nope')).toBe(false);
  });

  it('is inactive until both an RPC and a token address exist', () => {
    expect(gateActive({ rpcUrl: 'https://rpc', tokenAddress: undefined })).toBe(false);
    expect(gateActive({ rpcUrl: undefined, tokenAddress: `0x${'a'.repeat(40)}` })).toBe(false);
    expect(gateActive({ rpcUrl: '', tokenAddress: '' })).toBe(false);
    expect(gateActive({ rpcUrl: 'https://rpc', tokenAddress: `0x${'a'.repeat(40)}` })).toBe(true);
  });

  it('the balance seam throws NotActivated (no chain call in the stub)', async () => {
    await expect(readAmpBalance(`0x${'a'.repeat(40)}`)).rejects.toThrow(/not activated/i);
  });
});

describe('token gate — 24h grace on a dip (never an instant boot)', () => {
  const t0 = 1_000_000_000_000;

  it('holding the key → charged', () => {
    const d = decideAccess(H, t0, { kind: 'none' });
    expect(d.access).toBe('charged');
    expect(d.state).toEqual({ kind: 'held', sinceMs: t0 });
  });

  it('a fresh dip from held → grace + warn, a 24h window from the dip', () => {
    const d = decideAccess(0n, t0, { kind: 'held', sinceMs: t0 - 5 * HOUR });
    expect(d.access).toBe('grace');
    expect(d.warn).toBe(true);
    expect(d.graceUntilMs).toBe(t0 + TOKEN_GATE.graceHours * HOUR);
    expect(d.state).toEqual({ kind: 'dipped', sinceMs: t0 });
  });

  it('still in grace before 24h elapses', () => {
    const prev: GateState = { kind: 'dipped', sinceMs: t0 };
    const d = decideAccess(0n, t0 + 10 * HOUR, prev);
    expect(d.access).toBe('grace');
    expect(d.warn).toBe(true);
  });

  it('revoked only after the full 24h', () => {
    const prev: GateState = { kind: 'dipped', sinceMs: t0 };
    const d = decideAccess(0n, t0 + 25 * HOUR, prev);
    expect(d.access).toBe('denied');
    expect(d.state).toEqual({ kind: 'none' });
  });

  it('topping back up inside the window restores charged', () => {
    const prev: GateState = { kind: 'dipped', sinceMs: t0 };
    const d = decideAccess(H, t0 + 5 * HOUR, prev);
    expect(d.access).toBe('charged');
    expect(d.state).toEqual({ kind: 'held', sinceMs: t0 + 5 * HOUR });
  });

  it('a never-held wallet below threshold is a guest, not a revoke', () => {
    const d = decideAccess(0n, t0, { kind: 'none' });
    expect(d.access).toBe('denied');
    expect(d.warn).toBe(false);
    expect(d.graceUntilMs).toBeNull();
  });
});

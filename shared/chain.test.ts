import { describe, expect, it } from 'vitest';
import {
  AMP,
  BUYBACK_SPLIT,
  CHAIN,
  CHAIN_ENV,
  CREATOR_REWARDS_DEFAULT,
  DEAD_ADDRESS,
  GATE_MODE_DEFAULT,
  resolveGateMode,
  SPEND_SPLIT,
  TOKEN_GATE,
} from './chain';

describe('chain config (Robinhood Chain)', () => {
  it('is Robinhood Chain: EVM L2, native ETH, hood.fun / Uniswap v3', () => {
    expect(CHAIN.name).toBe('Robinhood Chain');
    expect(CHAIN.nativeCurrency).toBe('ETH');
    expect(CHAIN.launchpad).toBe('hood.fun');
    expect(CHAIN.dex).toBe('Uniswap v3');
  });

  it('leaves the chainId a placeholder until confirmed', () => {
    // TODO(chain) marks the real work — never sign against 0.
    expect(CHAIN.chainId).toBe(0);
  });

  it('$AMP is a standard 18-decimal ERC-20 with fixed 1e9 supply', () => {
    expect(AMP.standard).toBe('ERC-20');
    expect(AMP.decimals).toBe(18);
    expect(AMP.totalSupply).toBe(1_000_000_000n);
    expect(AMP.totalSupplyBase).toBe(1_000_000_000n * 10n ** 18n);
  });

  it('the token gate is 1,000 $AMP = 1000 × 10^18 base units', () => {
    expect(TOKEN_GATE.minTokens).toBe(1_000n);
    expect(TOKEN_GATE.minTokensBase).toBe(1_000n * 10n ** 18n);
    expect(TOKEN_GATE.graceHours).toBe(24);
  });

  it('every spend splits 30% burn / 70% treasury (sums to 100)', () => {
    expect(SPEND_SPLIT.burnPct).toBe(30);
    expect(SPEND_SPLIT.treasuryPct).toBe(70);
    expect(SPEND_SPLIT.burnPct + SPEND_SPLIT.treasuryPct).toBe(100);
  });

  it('the buyback splits half burn / half purse and is on by default', () => {
    expect(BUYBACK_SPLIT.burnPct + BUYBACK_SPLIT.pursePct).toBe(100);
    expect(BUYBACK_SPLIT.burnPct).toBe(50);
    expect(CREATOR_REWARDS_DEFAULT).toBe(true);
  });

  it('names env vars but never their secret values', () => {
    expect(CHAIN_ENV.rpcUrl).toBe('ROBINHOOD_RPC_URL');
    expect(CHAIN_ENV.tokenAddress).toBe('AMP_TOKEN_ADDRESS');
    expect(CHAIN_ENV.treasury).toBe('TREASURY_ADDRESS');
    expect(CHAIN_ENV.creatorRewardsEnabled).toBe('CREATOR_REWARDS_ENABLED');
    expect(CHAIN_ENV.gateMode).toBe('GATE_MODE');
    // The map holds NAMES, not addresses/keys/urls.
    for (const v of Object.values(CHAIN_ENV)) expect(v).toMatch(/^[A-Z_]+$/);
  });

  it('defaults the access gate to connect mode, flipped only by GATE_MODE', () => {
    expect(GATE_MODE_DEFAULT).toBe('connect');
    // Only the literal word "hold" opens hold mode — unset/anything else = connect.
    expect(resolveGateMode(undefined)).toBe('connect');
    expect(resolveGateMode('')).toBe('connect');
    expect(resolveGateMode('connect')).toBe('connect');
    expect(resolveGateMode('anything-else')).toBe('connect');
    expect(resolveGateMode('hold')).toBe('hold');
    expect(resolveGateMode('  HOLD ')).toBe('hold');
  });

  it('burns to the canonical EVM dead address', () => {
    expect(DEAD_ADDRESS).toBe('0x000000000000000000000000000000000000dEaD');
  });
});

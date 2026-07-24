import { describe, expect, it } from 'vitest';
import {
  composeSnapshot,
  parseMarketData,
  resolveFeedUrl,
  type FeedState,
} from './marketdata.js';

const dexPayload = (pairs: unknown[]): unknown => ({ pairs });

describe('parseMarketData — DexScreener shape', () => {
  it('reads price, 24h change and market cap from a pair', () => {
    const q = parseMarketData(
      dexPayload([
        {
          priceUsd: '0.0182',
          priceChange: { h24: -3.2 },
          marketCap: 18_200_000,
          liquidity: { usd: 250_000 },
        },
      ]),
    );
    expect(q).toEqual({ priceUsd: 0.0182, change24hPct: -3.2, marketCapUsd: 18_200_000 });
  });

  it('lets the deepest-liquidity pair speak for the token', () => {
    const q = parseMarketData(
      dexPayload([
        { priceUsd: '0.5', liquidity: { usd: 100 }, priceChange: { h24: 1 } },
        { priceUsd: '0.0182', liquidity: { usd: 900_000 }, priceChange: { h24: -3.2 } },
      ]),
    );
    expect(q?.priceUsd).toBe(0.0182);
    expect(q?.change24hPct).toBe(-3.2);
  });

  it('falls back to fdv when marketCap is absent', () => {
    const q = parseMarketData(dexPayload([{ priceUsd: '1.5', fdv: 42 }]));
    expect(q?.marketCapUsd).toBe(42);
  });

  it('NEVER yields a zero or negative price — that is a parse failure', () => {
    expect(parseMarketData(dexPayload([{ priceUsd: '0' }]))).toBeNull();
    expect(parseMarketData(dexPayload([{ priceUsd: '-1' }]))).toBeNull();
    expect(parseMarketData(dexPayload([{ priceUsd: 'soon' }]))).toBeNull();
    expect(parseMarketData(dexPayload([]))).toBeNull();
  });

  it('keeps a missing 24h change as null, not zero', () => {
    const q = parseMarketData(dexPayload([{ priceUsd: '2' }]));
    expect(q?.change24hPct).toBeNull();
  });
});

describe('parseMarketData — GeckoTerminal shape', () => {
  it('reads attributes from the data envelope', () => {
    const q = parseMarketData({
      data: {
        attributes: {
          price_usd: '0.031',
          market_cap_usd: '31000000',
          price_change_percentage: { h24: '4.7' },
        },
      },
    });
    expect(q).toEqual({ priceUsd: 0.031, change24hPct: 4.7, marketCapUsd: 31_000_000 });
  });

  it('accepts base_token_price_usd + fdv_usd fallbacks', () => {
    const q = parseMarketData({
      data: { attributes: { base_token_price_usd: '0.5', fdv_usd: '900' } },
    });
    expect(q).toEqual({ priceUsd: 0.5, change24hPct: null, marketCapUsd: 900 });
  });

  it('rejects garbage wholesale', () => {
    expect(parseMarketData(null)).toBeNull();
    expect(parseMarketData('html error page')).toBeNull();
    expect(parseMarketData({ data: { attributes: {} } })).toBeNull();
    expect(parseMarketData({})).toBeNull();
  });
});

describe('composeSnapshot — the fail-soft contract', () => {
  const quote = { priceUsd: 0.0182, change24hPct: -3.2, marketCapUsd: 18_200_000 };
  const STALE = 300_000;

  it('unconfigured: the ticker rests (T3 pre-token state)', () => {
    const s = composeSnapshot(false, { quote: null, fetchedAtMs: 0 }, 1_000, STALE, null);
    expect(s.configured).toBe(false);
    expect(s.live).toBe(false);
    expect(s.priceUsd).toBeNull();
  });

  it('fresh quote: live with the figures', () => {
    const st: FeedState = { quote, fetchedAtMs: 10_000 };
    const s = composeSnapshot(true, st, 10_000 + 60_000, STALE, null);
    expect(s.live).toBe(true);
    expect(s.priceUsd).toBe(0.0182);
    expect(s.change24hPct).toBe(-3.2);
    expect(s.marketCapUsd).toBe(18_200_000);
    expect(s.asOfMs).toBe(10_000);
  });

  it('NEVER serves a stale quote as fresh — past the cap it rests', () => {
    const st: FeedState = { quote, fetchedAtMs: 10_000 };
    const s = composeSnapshot(true, st, 10_000 + STALE + 1, STALE, null);
    expect(s.live).toBe(false);
    expect(s.priceUsd).toBeNull();
    expect(s.marketCapUsd).toBeNull();
    expect(s.asOfMs).toBe(0);
  });

  it('configured but never fetched: rests, no zeros anywhere', () => {
    const s = composeSnapshot(true, { quote: null, fetchedAtMs: 0 }, 5_000, STALE, null);
    expect(s.live).toBe(false);
    expect(s.priceUsd).toBeNull();
    expect(s.change24hPct).toBeNull();
  });

  it('the burned total rides only on a live quote and may itself be null', () => {
    const st: FeedState = { quote, fetchedAtMs: 10_000 };
    expect(composeSnapshot(true, st, 11_000, STALE, 12_402_110).burnedAmp).toBe(12_402_110);
    expect(composeSnapshot(true, st, 11_000, STALE, null).burnedAmp).toBeNull();
    expect(
      composeSnapshot(true, st, 10_000 + STALE + 1, STALE, 12_402_110).burnedAmp,
    ).toBeNull();
  });
});

describe('resolveFeedUrl', () => {
  it('is null while unset (the pre-launch default)', () => {
    expect(resolveFeedUrl({})).toBeNull();
    expect(resolveFeedUrl({ MARKET_DATA_URL: '  ' })).toBeNull();
  });

  it('passes a literal URL through', () => {
    expect(resolveFeedUrl({ MARKET_DATA_URL: 'https://feed.example/amp' })).toBe(
      'https://feed.example/amp',
    );
  });

  it('substitutes {address} from the token address env', () => {
    expect(
      resolveFeedUrl({
        MARKET_DATA_URL: 'https://feed.example/tokens/{address}',
        AMP_TOKEN_ADDRESS: '0xabc',
      }),
    ).toBe('https://feed.example/tokens/0xabc');
  });

  it('an {address} URL without a token address is NOT configured', () => {
    expect(resolveFeedUrl({ MARKET_DATA_URL: 'https://x/{address}' })).toBeNull();
  });
});

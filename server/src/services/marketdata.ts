import { CHAIN_ENV } from '@shared/chain';
import { CONFIG } from '@shared/config';
import type { MarketSyncEvent } from '@shared/protocol';

/**
 * T1 — THE CITY BOARD'S MARKET FEED. Server-side only: one cached fetch of a
 * public DEX-data endpoint (DexScreener/GeckoTerminal shape) per
 * {@link CONFIG.billboard.refreshSeconds}, shared by every room.
 *
 * FAIL SOFT is the contract (and the point): if the feed is unconfigured,
 * unreachable, or the last good quote has aged past `staleAfterSeconds`, the
 * snapshot reports `live: false` and null figures — the ticker RESTS. It
 * never serves a stale quote as fresh, and it never serves zeros.
 *
 * Golden rules: reporting only. No copy here or downstream may sell, project,
 * or say "earn"/"yield"/"APY" — the board shows figures, nothing more.
 */

/** A validated market quote. Prices are strictly positive — zero is a parse
 *  failure, not a price (never zeros). */
export interface MarketQuote {
  priceUsd: number;
  /** 24h change in percent; null when the feed doesn't report one. */
  change24hPct: number | null;
  /** Market cap in USD; null when the feed doesn't report one. */
  marketCapUsd: number | null;
}

/** What the service remembers between fetches. */
export interface FeedState {
  quote: MarketQuote | null;
  /** Server clock (ms) of the last SUCCESSFUL parse; 0 = never. */
  fetchedAtMs: number;
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

const pos = (v: unknown): number | null => {
  const n = num(v);
  return n !== null && n > 0 ? n : null;
};

/**
 * Parse a DexScreener-style payload: `{ pairs: [{ priceUsd, priceChange:
 * { h24 }, marketCap|fdv, liquidity: { usd } }] }`. Multiple pairs → the
 * deepest-liquidity one speaks for the token.
 */
function parseDexScreener(json: Record<string, unknown>): MarketQuote | null {
  const pairs = json['pairs'];
  if (!Array.isArray(pairs) || pairs.length === 0) return null;
  let best: Record<string, unknown> | null = null;
  let bestLiq = -1;
  for (const p of pairs) {
    if (typeof p !== 'object' || p === null) continue;
    const rec = p as Record<string, unknown>;
    const liq = num((rec['liquidity'] as Record<string, unknown> | undefined)?.['usd']) ?? 0;
    if (liq > bestLiq) {
      bestLiq = liq;
      best = rec;
    }
  }
  if (best === null) return null;
  const priceUsd = pos(best['priceUsd']);
  if (priceUsd === null) return null;
  const change = num((best['priceChange'] as Record<string, unknown> | undefined)?.['h24']);
  const marketCapUsd = pos(best['marketCap']) ?? pos(best['fdv']);
  return { priceUsd, change24hPct: change, marketCapUsd };
}

/**
 * Parse a GeckoTerminal-style payload: `{ data: { attributes: { price_usd |
 * base_token_price_usd, market_cap_usd|fdv_usd, price_change_percentage:
 * { h24 } } } }`.
 */
function parseGeckoTerminal(json: Record<string, unknown>): MarketQuote | null {
  const data = json['data'];
  if (typeof data !== 'object' || data === null) return null;
  const attrs = (data as Record<string, unknown>)['attributes'];
  if (typeof attrs !== 'object' || attrs === null) return null;
  const a = attrs as Record<string, unknown>;
  const priceUsd = pos(a['price_usd']) ?? pos(a['base_token_price_usd']);
  if (priceUsd === null) return null;
  const change = num(
    (a['price_change_percentage'] as Record<string, unknown> | undefined)?.['h24'],
  );
  const marketCapUsd = pos(a['market_cap_usd']) ?? pos(a['fdv_usd']);
  return { priceUsd, change24hPct: change, marketCapUsd };
}

/** Parse either supported feed shape; null on anything else (fail soft). */
export function parseMarketData(json: unknown): MarketQuote | null {
  if (typeof json !== 'object' || json === null) return null;
  const rec = json as Record<string, unknown>;
  return 'pairs' in rec ? parseDexScreener(rec) : parseGeckoTerminal(rec);
}

/**
 * Compose the wire snapshot from remembered state — PURE, so the fail-soft
 * rules are unit-testable off a live server. `live` demands all three:
 * configured, a quote in hand, and that quote younger than the staleness cap.
 */
export function composeSnapshot(
  configured: boolean,
  st: FeedState,
  nowMs: number,
  staleAfterMs: number,
  burnedAmp: number | null,
): MarketSyncEvent {
  const fresh =
    configured && st.quote !== null && nowMs - st.fetchedAtMs <= staleAfterMs;
  return {
    live: fresh,
    configured,
    priceUsd: fresh ? (st.quote as MarketQuote).priceUsd : null,
    change24hPct: fresh ? (st.quote as MarketQuote).change24hPct : null,
    marketCapUsd: fresh ? (st.quote as MarketQuote).marketCapUsd : null,
    burnedAmp: fresh ? burnedAmp : null,
    asOfMs: fresh ? st.fetchedAtMs : 0,
  };
}

/** The feed URL from env, with `{address}` substituted; null = unconfigured. */
export function resolveFeedUrl(env: Record<string, string | undefined>): string | null {
  const raw = env[CHAIN_ENV.marketDataUrl]?.trim();
  if (raw === undefined || raw === '') return null;
  if (!raw.includes('{address}')) return raw;
  const addr = env[CHAIN_ENV.tokenAddress]?.trim();
  if (addr === undefined || addr === '') return null;
  return raw.replaceAll('{address}', addr);
}

class MarketDataService {
  private st: FeedState = { quote: null, fetchedAtMs: 0 };
  private timer: NodeJS.Timeout | null = null;

  configured(): boolean {
    return resolveFeedUrl(process.env) !== null;
  }

  /** The current wire snapshot (what rooms seed + broadcast). The burned
   *  total awaits the token ledger's reporting — null hides the panel. */
  snapshot(nowMs = Date.now()): MarketSyncEvent {
    return composeSnapshot(
      this.configured(),
      this.st,
      nowMs,
      CONFIG.billboard.staleAfterSeconds * 1000,
      null,
    );
  }

  /** One guarded fetch+parse. Failures keep the old state — staleness is
   *  judged at snapshot time, never papered over here. */
  async fetchOnce(): Promise<void> {
    const url = resolveFeedUrl(process.env);
    if (url === null) return;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return;
      const quote = parseMarketData(await res.json());
      if (quote === null) return;
      this.st = { quote, fetchedAtMs: Date.now() };
    } catch {
      // Unreachable feed: keep what we had; the staleness cap decides.
    }
  }

  /** Boot the refresh loop (no-op while unconfigured — the ticker rests).
   *  Self-arming unref'd timer, the nightly-rollup precedent. */
  start(): void {
    if (this.timer !== null || !this.configured()) return;
    const arm = (): void => {
      this.timer = setTimeout(() => {
        void this.fetchOnce().finally(arm);
      }, CONFIG.billboard.refreshSeconds * 1000);
      this.timer.unref();
    };
    void this.fetchOnce().finally(arm);
  }

  stop(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Test seam. */
  reset(): void {
    this.stop();
    this.st = { quote: null, fetchedAtMs: 0 };
  }
}

export const marketData = new MarketDataService();

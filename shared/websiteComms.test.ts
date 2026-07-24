import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Comms rules for the marketing site (founder-approved copy — this test
 * REPORTS, it never rewrites): the same banned list the game strings
 * carry, word-boundary matched so "learn" never trips "earn", scanned
 * over every website/*.html with markup stripped.
 *
 * Sanctioned allowances (intentional lines, pass as-is):
 *  - "held, never spent"
 *  - the phased key line: "holding 1,000 $AMP becomes your key soon"
 */
const SITE_DIR = join(__dirname, '..', 'website');

const BANNED: readonly RegExp[] = [
  /\bearn(s|ed|ing)?\b/i,
  /\byield(s|ed|ing)?\b/i,
  /\bAPY\b/i,
  /\bAPR\b/i,
  /\bpassive income\b/i,
  /\binvest(s|ed|ing|ment|ments|or|ors)?\b/i,
  // Price-talk phrasing: price/pump/moon/"number go up"/to-the-moon tickers.
  /\bprice(s|d)?\b/i,
  /\bpump(s|ed|ing)?\b/i,
  /\bmoon(s|ed|ing)?\b/i,
  /\bnumber go(es)? up\b/i,
  /\bprofit(s|ed|ing|able)?\b/i,
];

const ALLOWANCES: readonly string[] = [
  'held, never spent',
  'holding 1,000 $AMP becomes your key soon',
  // Founder-ruled 2026-07-24: disclaimers that use a banned word to
  // NEGATE it are the rule working as intended.
  'not an investment',
  'Is $AMP an investment? No.',
  'no promise about price or return, and it never will',
  'explains mechanism, not markets, and makes no promise about price',
  // Founder-ruled: in-game Bolts pricing is game-economy description,
  // not token price talk — same sanctioned usage as the merchant panel.
  'Merchant prices move with real supply',
  'Their prices move with real supply and demand',
  'Watching prices is itself part of the game',
  'Set your prices, come back to a fuller coffer',
  // Founder-ruled: a factual product statement.
  'priced in $AMP',
  // The ruled replacement for the old "token earns" line (item 3).
  "the creator rewards paid on $AMP's trading volume on Robinhood Chain",
];

/**
 * Hits found on first scan (2026-07-24), AWAITING FOUNDER RULING — the
 * site voice is founder-approved, so this test reports rather than
 * rewrites. Each exact phrase below is excused until ruled on; anything
 * NEW still fails the gate. Remove entries as rulings land.
 *  - disclaimers using the word to negate it ("not an investment")
 *  - the creator-fee mechanism line ("fees the token earns")
 *  - in-game merchant Bolts pricing (the game's own UI says "prices
 *    move inside each published band" — likely sanctioned)
 */
const PENDING_RULING: readonly string[] = [];

/** Markup → visible text: strip tags/scripts/styles, decode basic entities. */
function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
}

describe('website comms rules', () => {
  const pages = readdirSync(SITE_DIR).filter((f) => f.endsWith('.html'));

  it('finds the four pages', () => {
    expect(pages.length).toBeGreaterThanOrEqual(4);
  });

  for (const page of pages) {
    it(`${page} carries no banned comms language`, () => {
      let text = visibleText(readFileSync(join(SITE_DIR, page), 'utf8'));
      for (const ok of [...ALLOWANCES, ...PENDING_RULING]) text = text.split(ok).join(' ');
      const hits: string[] = [];
      for (const re of BANNED) {
        const m = text.match(new RegExp(re.source, re.flags + 'g'));
        if (m !== null) {
          for (const hit of m) {
            const idx = text.toLowerCase().indexOf(hit.toLowerCase());
            hits.push(`"${hit}" — …${text.slice(Math.max(0, idx - 60), idx + 70).trim()}…`);
          }
        }
      }
      expect(hits, hits.join('\n')).toEqual([]);
    });
  }
});

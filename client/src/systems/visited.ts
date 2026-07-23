/**
 * Map M4 — which districts this Spark has walked (presentation memory).
 * Two ledgers in localStorage: `visited` flips on arrival (WorldScene),
 * `lit` flips when the world map has PLAYED the first-visit light-up, so
 * the little moment happens exactly once per district. Purely cosmetic —
 * nothing server-side reads this.
 */

const VISITED_KEY = 'amperia.districts.visited';
const LIT_KEY = 'amperia.districts.lit';

function read(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return new Set();
    const arr: unknown = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function write(key: string, s: Set<string>): void {
  try {
    localStorage.setItem(key, JSON.stringify([...s]));
  } catch {
    /* private mode — the map just re-dims next session */
  }
}

export function visitedDistricts(): Set<string> {
  return read(VISITED_KEY);
}

/** Record an arrival; returns true when this is the FIRST visit. */
export function markVisited(district: string): boolean {
  const s = read(VISITED_KEY);
  if (s.has(district)) return false;
  s.add(district);
  write(VISITED_KEY, s);
  return true;
}

/** Districts visited but whose map light-up hasn't played yet. */
export function unlitVisited(): string[] {
  const lit = read(LIT_KEY);
  return [...read(VISITED_KEY)].filter((d) => !lit.has(d));
}

export function markLit(district: string): void {
  const s = read(LIT_KEY);
  s.add(district);
  write(LIT_KEY, s);
}

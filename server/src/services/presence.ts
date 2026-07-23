import type { DistrictId } from '@shared/map';

/**
 * Cross-district live presence (world map M3). A single-process registry:
 * each district room reports its seated (non-spectator) Spark count and
 * hears when any district's count changes, so every client's world map can
 * show "Sparks there now". Presence facts only — no identities, no value.
 * When the server goes multi-instance this moves onto the Redis presence
 * layer (services/redis.ts holds the seam).
 */
const counts = new Map<DistrictId, number>();
const listeners = new Set<() => void>();

export const presence = {
  /** Report a district's current seated-Spark count (idempotent). */
  report(district: DistrictId, sparks: number): void {
    if (counts.get(district) === sparks) return;
    counts.set(district, sparks);
    for (const fn of [...listeners]) fn();
  },

  /** The live tally across every district that has reported. */
  counts(): Partial<Record<DistrictId, number>> {
    return Object.fromEntries(counts.entries()) as Partial<Record<DistrictId, number>>;
  },

  /** Register a change listener; returns the unsubscribe. */
  onChange(fn: () => void): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },

  /** Test seam: forget everything. */
  reset(): void {
    counts.clear();
    listeners.clear();
  },
};

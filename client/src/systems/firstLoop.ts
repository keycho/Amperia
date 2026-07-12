/**
 * R3 — the guided "First Bolts" loop + progressive disclosure.
 *
 * A brand-new Spark's first five minutes must contain exactly ONE idea:
 * gather → sell → buy. Until they earn their first Bolts we HIDE the rest of
 * the game's chatter (Fortune Coil flavor, Rested Charge banner, Manifest /
 * weekly-goal toasts) so nothing competes with the loop; each unlocks with a
 * single one-line toast once the first Bolts land.
 *
 * This module is the tiny shared state both scenes read. WorldScene owns the
 * step machine, the world arrow, and the heap highlight; UIScene owns the
 * checklist and the suppression gates.
 */

const DONE_KEY = 'amperia.firstloop.done';

/** The checklist model WorldScene emits to UIScene (SessionEvents.tutorial). */
export interface TutorialModel {
  steps: Array<{ label: string; done: boolean }>;
  /** Index of the current step, or -1 when the loop is complete. */
  active: number;
}

export const firstLoop = {
  /** The tutorial is running for this Spark (fresh, not previously done). */
  active: false,
  /** First Bolts have landed — the disclosure trigger has fired. */
  boltsEarned: false,

  /** Has this browser already finished the first loop? */
  isDone(): boolean {
    try {
      return localStorage.getItem(DONE_KEY) === '1';
    } catch {
      return false;
    }
  },
  markDone(): void {
    this.active = false;
    try {
      localStorage.setItem(DONE_KEY, '1');
    } catch {
      /* private-mode: the loop just re-shows next session — harmless */
    }
  },

  /**
   * Should a server flavor NOTICE be dropped right now? Only while the
   * tutorial is pre-Bolts, and only the known ambient lines — real feedback
   * ("Your Pack is full", sale results) always passes.
   */
  suppressFlavor(text: string): boolean {
    // R6: ambient flavor stays silent for the WHOLE guided loop (markDone
    // clears `active`), so the first minutes hold only gather → sell → buy.
    if (!this.active) return false;
    return FLAVOR_PATTERNS.some((re) => re.test(text));
  },
};

const FLAVOR_PATTERNS: RegExp[] = [
  /Fortune Coil is wound/i,
  /Coil rests until tomorrow/i,
  /free spin/i,
];

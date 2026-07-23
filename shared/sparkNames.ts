/**
 * F5 — the city's name-roll, shared by the server (seating a fresh wallet's
 * Spark) and the client (the creator's ⚂ roll button). One voice, no
 * machine names: a Spark is never user-visible as `Spark-a1b2c3`, not even
 * for the minute between signing in and confirming the creator.
 */

export const NAME_HEADS = [
  'Weld', 'Volt', 'Flux', 'Brass', 'Coil', 'Ember', 'Socket', 'Dyna', 'Rivet', 'Amp',
] as const;

export const NAME_TAILS = [
  'a', 'ka', 'ric', 'low', 'mira', 'tin', 'na', 'wick', 'ette', 'bolt', 'sy', 'ler',
] as const;

/** Roll a cozy name in the city's voice (optionally numbered, always ≤16). */
export function rollSparkName(rand: () => number = Math.random): string {
  const head = NAME_HEADS[Math.floor(rand() * NAME_HEADS.length)] as string;
  const tail = NAME_TAILS[Math.floor(rand() * NAME_TAILS.length)] as string;
  const n = rand() < 0.35 ? `-${Math.floor(10 + rand() * 90)}` : '';
  return `${head}${tail}${n}`;
}

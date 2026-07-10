/**
 * Merchant price-band math (Economy Design §5 lever style): the NPC buys
 * resources at a dynamic unit price inside a PUBLISHED floor/ceiling band.
 * Sale volume slides the price down its band (pressure → 1), and pressure
 * recovers toward the ceiling over time. Pure functions — this becomes the
 * live economy's faucet throttle, so it stays unit-tested off the server.
 */

export interface PriceBand {
  /** Bolts per unit at maximum pressure (never lower). */
  floor: number;
  /** Bolts per unit at zero pressure (never higher). */
  ceiling: number;
  /** Pressure added per unit sold (0..1 scale). */
  slidePerUnit: number;
  /** Pressure recovered per hour of world time. */
  recoverPerHour: number;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** Current unit price for a resource at the given pressure. */
export function merchantUnitPrice(pressure: number, band: PriceBand): number {
  const p = clamp01(pressure);
  return Math.max(
    band.floor,
    Math.round(band.ceiling - (band.ceiling - band.floor) * p),
  );
}

/** Pressure recovery after `hours` of world time. */
export function pressureAfterRecovery(
  pressure: number,
  hours: number,
  band: PriceBand,
): number {
  return clamp01(pressure - Math.max(0, hours) * band.recoverPerHour);
}

/**
 * Value of selling `qty` units: the price slides unit-by-unit DURING the
 * sale, so dumping a huge stack earns less per unit than trickling it.
 * Returns the Bolts total and the pressure after the sale.
 */
export function saleValue(
  pressure: number,
  qty: number,
  band: PriceBand,
): { totalBolts: number; endPressure: number } {
  let p = clamp01(pressure);
  let total = 0;
  for (let i = 0; i < qty; i++) {
    total += merchantUnitPrice(p, band);
    p = clamp01(p + band.slidePerUnit);
  }
  return { totalBolts: total, endPressure: p };
}

/** UTC day key for daily caps/rollovers ('YYYY-MM-DD'). */
export function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/**
 * How many Bolts of NPC sales this account still has today, given the cap.
 * Rolls over automatically when the stored day differs from today.
 */
export function dailySaleHeadroom(
  soldToday: number,
  storedDay: string,
  now: number,
  capBolts: number,
): { headroom: number; day: string; soldToday: number } {
  const today = dayKey(now);
  const effectiveSold = storedDay === today ? soldToday : 0;
  return { headroom: Math.max(0, capBolts - effectiveSold), day: today, soldToday: effectiveSold };
}

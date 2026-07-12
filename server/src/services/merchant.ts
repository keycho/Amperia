import { CONFIG } from '@shared/config';
import {
  merchantUnitPrice,
  pressureAfterRecovery,
  saleValue,
  type PriceBand,
} from '@shared/economy';
import { prisma } from './db.js';

/**
 * World-shared merchant price state: one pressure value per resource,
 * persisted so the faucet throttle survives restarts. Recovery is applied
 * lazily from `updatedAt` whenever a price is read.
 */

type ResourceId = keyof typeof CONFIG.economy.merchant.buy;

const RESOURCES = Object.keys(CONFIG.economy.merchant.buy) as ResourceId[];

interface PressureState {
  pressure: number;
  at: number;
}

class MerchantService {
  private state = new Map<ResourceId, PressureState>();
  private loaded = false;

  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const rows = await prisma.merchantState.findMany();
      for (const r of RESOURCES) {
        const row = rows.find((x) => x.resourceId === r);
        this.state.set(r, {
          pressure: row?.pressure ?? 0,
          at: row?.updatedAt.getTime() ?? Date.now(),
        });
      }
    } catch (err) {
      console.error('[merchant] load failed; starting at zero pressure', err);
      for (const r of RESOURCES) this.state.set(r, { pressure: 0, at: Date.now() });
    }
  }

  band(resource: ResourceId): PriceBand {
    return CONFIG.economy.merchant.buy[resource];
  }

  /** Current pressure with lazy time-recovery applied. */
  private pressureNow(resource: ResourceId, now: number): number {
    const st = this.state.get(resource) ?? { pressure: 0, at: now };
    const hours = Math.max(0, now - st.at) / 3_600_000;
    return pressureAfterRecovery(st.pressure, hours, this.band(resource));
  }

  unitPrice(resource: ResourceId, now: number): number {
    return merchantUnitPrice(this.pressureNow(resource, now), this.band(resource));
  }

  prices(now: number): Record<string, number> {
    const out: Record<string, number> = {};
    for (const r of RESOURCES) out[r] = this.unitPrice(r, now);
    return out;
  }

  /**
   * Dry-run: the largest sub-quantity of `qtyWanted` whose total value fits
   * inside `capBolts`, priced unit-by-unit from current pressure. Commits
   * nothing.
   */
  quoteWithinCap(
    resource: ResourceId,
    qtyWanted: number,
    capBolts: number,
    now: number,
  ): { qty: number; totalBolts: number } {
    const band = this.band(resource);
    let p = this.pressureNow(resource, now);
    let total = 0;
    let qty = 0;
    for (let i = 0; i < qtyWanted; i++) {
      const unit = merchantUnitPrice(p, band);
      if (total + unit > capBolts) break;
      total += unit;
      qty += 1;
      p = Math.min(1, p + band.slidePerUnit);
    }
    return { qty, totalBolts: total };
  }

  /** Execute a sale: returns the Bolts paid; slides + persists pressure. */
  sell(resource: ResourceId, qty: number, now: number): number {
    const p = this.pressureNow(resource, now);
    const { totalBolts, endPressure } = saleValue(p, qty, this.band(resource));
    this.state.set(resource, { pressure: endPressure, at: now });
    void prisma.merchantState
      .upsert({
        where: { resourceId: resource },
        create: { resourceId: resource, pressure: endPressure },
        update: { pressure: endPressure },
      })
      .catch((err) => console.error('[merchant] persist failed', err));
    return totalBolts;
  }

  isResource(itemId: string): itemId is ResourceId {
    return (RESOURCES as string[]).includes(itemId);
  }
}

export const merchant = new MerchantService();

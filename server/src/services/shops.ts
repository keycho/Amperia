import { CONFIG } from '@shared/config';
import type { ItemId } from '@shared/items';
import { prisma } from './db.js';
import { ledger } from './ledger.js';

/**
 * Player shop stalls (E2) — the Nightstalls' asynchronous market. Stock
 * escrows in the DB so a stall sells while its owner is OFFLINE; proceeds
 * accumulate in the stall's cashbox until the owner collects. Every
 * mutation is optimistic-version-guarded (UPDATE … WHERE version = seen)
 * so horizontally-scaled room instances can't double-sell a stack.
 *
 * NOTE (M4): allocation is first-come flat-rent for now. Premium deed
 * AUCTIONS replace the allocation method at the token layer — keep every
 * "who gets a vacant stall" decision inside rent() so it stays swappable.
 */

export interface StockLine {
  itemId: ItemId;
  qty: number;
  priceBolts: number;
  durability?: number;
}

export interface StallView {
  id: number;
  ownerAccountId: string | null;
  ownerName: string;
  rentPaidUntilMs: number | null;
  stock: StockLine[];
  cashboxBolts: number;
  awaySaleBolts: number;
}

export interface MailDelivery {
  id: string;
  bolts: number;
  stock: Array<{ itemId: ItemId; qty: number; durability?: number }>;
  reason: string;
}

const WEEK_MS = 7 * 86_400_000;

interface StallRow {
  id: number;
  ownerAccountId: string | null;
  ownerName: string;
  rentPaidUntil: Date | null;
  stockJson: unknown;
  cashboxBolts: number;
  awaySaleBolts: number;
  version: number;
}

function parseStock(raw: unknown): StockLine[] {
  if (!Array.isArray(raw)) return [];
  const out: StockLine[] = [];
  for (const line of raw) {
    if (
      typeof line === 'object' &&
      line !== null &&
      typeof (line as StockLine).itemId === 'string' &&
      typeof (line as StockLine).qty === 'number' &&
      (line as StockLine).qty > 0 &&
      typeof (line as StockLine).priceBolts === 'number'
    ) {
      const l = line as StockLine;
      out.push(
        l.durability === undefined
          ? { itemId: l.itemId, qty: Math.floor(l.qty), priceBolts: Math.floor(l.priceBolts) }
          : {
              itemId: l.itemId,
              qty: Math.floor(l.qty),
              priceBolts: Math.floor(l.priceBolts),
              durability: Math.floor(l.durability),
            },
      );
    }
  }
  return out;
}

function view(row: StallRow): StallView {
  return {
    id: row.id,
    ownerAccountId: row.ownerAccountId,
    ownerName: row.ownerName,
    rentPaidUntilMs: row.rentPaidUntil?.getTime() ?? null,
    stock: parseStock(row.stockJson),
    cashboxBolts: row.cashboxBolts,
    awaySaleBolts: row.awaySaleBolts,
  };
}

class ShopService {
  /** Make sure a row exists for every stall pitch on the lane. */
  async ensureRows(count: number): Promise<void> {
    for (let id = 0; id < count; id++) {
      await prisma.shopStall.upsert({ where: { id }, create: { id }, update: {} });
    }
  }

  /**
   * Version-guarded write: succeeds only if nobody touched the row since
   * we read it. Callers re-read and retry (or refuse) on false.
   */
  private async guarded(
    id: number,
    version: number,
    data: Record<string, unknown>,
  ): Promise<boolean> {
    const r = await prisma.shopStall.updateMany({
      where: { id, version },
      data: { ...data, version: { increment: 1 } },
    });
    return r.count === 1;
  }

  /**
   * Lazy rent expiry: a lapsed stall is vacated on ANY access — the
   * ex-owner's stock + cashbox go to the StallReturn mailbox (delivered on
   * their next login), and the pitch is free for the next Spark.
   */
  private async expireIfDue(row: StallRow, now: number): Promise<StallRow> {
    if (row.ownerAccountId === null) return row;
    if (row.rentPaidUntil !== null && row.rentPaidUntil.getTime() > now) return row;
    const stock = parseStock(row.stockJson);
    const ok = await this.guarded(row.id, row.version, {
      ownerAccountId: null,
      ownerName: '',
      rentPaidUntil: null,
      stockJson: [],
      cashboxBolts: 0,
      awaySaleBolts: 0,
    });
    if (!ok) {
      // Someone else raced us (likely another instance's sweep) — re-read.
      const fresh = await prisma.shopStall.findUniqueOrThrow({ where: { id: row.id } });
      return fresh as StallRow;
    }
    if (stock.length > 0 || row.cashboxBolts > 0) {
      // Mailbox rows reuse the full StockLine shape (price is ignored).
      await prisma.stallReturn.create({
        data: {
          accountId: row.ownerAccountId,
          boltsAmount: row.cashboxBolts,
          stockJson: stock as unknown as object[],
          reason: 'rentExpired',
        },
      });
    }
    // Conservation, not creation: the goods just changed pockets.
    ledger.log({
      type: 'trade',
      account: row.ownerAccountId,
      data: {
        side: 'stallVacated',
        stallId: row.id,
        cashboxBolts: row.cashboxBolts,
        stock,
      },
    });
    const fresh = await prisma.shopStall.findUniqueOrThrow({ where: { id: row.id } });
    return fresh as StallRow;
  }

  private async freshRow(stallId: number, now: number): Promise<StallRow> {
    const row = (await prisma.shopStall.findUniqueOrThrow({
      where: { id: stallId },
    })) as StallRow;
    return this.expireIfDue(row, now);
  }

  async get(stallId: number, now: number): Promise<StallView> {
    return view(await this.freshRow(stallId, now));
  }

  async getAll(now: number): Promise<StallView[]> {
    const rows = (await prisma.shopStall.findMany({ orderBy: { id: 'asc' } })) as StallRow[];
    const out: StallView[] = [];
    for (const row of rows) out.push(view(await this.expireIfDue(row, now)));
    return out;
  }

  /** The stall an account currently rents, if any. */
  async ownedBy(accountId: string, now: number): Promise<StallView | null> {
    const row = (await prisma.shopStall.findFirst({
      where: { ownerAccountId: accountId },
    })) as StallRow | null;
    if (row === null) return null;
    const fresh = await this.expireIfDue(row, now);
    return fresh.ownerAccountId === accountId ? view(fresh) : null;
  }

  /**
   * ALLOCATION POINT (swappable — see the M4 note up top): first-come
   * rental of a vacant pitch. The caller has already taken the rent Bolts
   * from the renter's balance and refunds them if this returns an error.
   */
  async rent(
    stallId: number,
    accountId: string,
    ownerName: string,
    now: number,
  ): Promise<string | null> {
    const row = await this.freshRow(stallId, now);
    if (row.ownerAccountId !== null) return 'That stall is already spoken for.';
    const existing = await this.ownedBy(accountId, now);
    if (existing !== null) return 'You already keep a stall down the lane.';
    const ok = await this.guarded(stallId, row.version, {
      ownerAccountId: accountId,
      ownerName,
      rentPaidUntil: new Date(now + WEEK_MS),
      stockJson: [],
      cashboxBolts: 0,
      awaySaleBolts: 0,
    });
    return ok ? null : 'The stall ledger is busy — try again.';
  }

  /** Extend the rent by a week, up to the config cap ahead. */
  async renew(stallId: number, accountId: string, now: number): Promise<string | null> {
    const row = await this.freshRow(stallId, now);
    if (row.ownerAccountId !== accountId) return 'Not your stall to renew.';
    const base = Math.max(now, row.rentPaidUntil?.getTime() ?? now);
    const next = base + WEEK_MS;
    if (next > now + CONFIG.economy.shops.maxWeeksAhead * WEEK_MS) {
      return `Rent can only be paid ${CONFIG.economy.shops.maxWeeksAhead} weeks ahead.`;
    }
    const ok = await this.guarded(stallId, row.version, { rentPaidUntil: new Date(next) });
    return ok ? null : 'The stall ledger is busy — try again.';
  }

  /**
   * Put goods on the counter. The caller already REMOVED them from the
   * owner's pack (synchronously) and re-adds them if this errors.
   */
  async stock(stallId: number, accountId: string, line: StockLine, now: number): Promise<string | null> {
    if (line.qty <= 0 || !Number.isInteger(line.qty)) return 'Nothing to stock.';
    if (
      !Number.isInteger(line.priceBolts) ||
      line.priceBolts < CONFIG.economy.shops.minPriceBolts ||
      line.priceBolts > CONFIG.economy.shops.maxPriceBolts
    ) {
      return 'That asking price will not do.';
    }
    const row = await this.freshRow(stallId, now);
    if (row.ownerAccountId !== accountId) return 'Not your stall to stock.';
    const stock = parseStock(row.stockJson);
    // Merge with an identical line (same item, price, wear) if present.
    const match = stock.find(
      (l) =>
        l.itemId === line.itemId &&
        l.priceBolts === line.priceBolts &&
        l.durability === line.durability,
    );
    if (match !== undefined) match.qty += line.qty;
    else if (stock.length >= CONFIG.economy.shops.maxStockLines) return 'The counter is full.';
    else stock.push(line);
    const ok = await this.guarded(stallId, row.version, { stockJson: stock as unknown as object[] });
    return ok ? null : 'The stall ledger is busy — try again.';
  }

  /** Take goods back off the counter; returns what came off. */
  async unstock(
    stallId: number,
    accountId: string,
    lineIdx: number,
    qty: number,
    now: number,
  ): Promise<{ error: string } | { taken: StockLine }> {
    const row = await this.freshRow(stallId, now);
    if (row.ownerAccountId !== accountId) return { error: 'Not your stall.' };
    const stock = parseStock(row.stockJson);
    const line = stock[lineIdx];
    if (line === undefined) return { error: 'Nothing there.' };
    const take = Math.min(Math.max(1, Math.floor(qty)), line.qty);
    line.qty -= take;
    const next = stock.filter((l) => l.qty > 0);
    const ok = await this.guarded(stallId, row.version, { stockJson: next as unknown as object[] });
    if (!ok) return { error: 'The stall ledger is busy — try again.' };
    return { taken: { ...line, qty: take } };
  }

  async setPrice(
    stallId: number,
    accountId: string,
    lineIdx: number,
    priceBolts: number,
    now: number,
  ): Promise<string | null> {
    if (
      !Number.isInteger(priceBolts) ||
      priceBolts < CONFIG.economy.shops.minPriceBolts ||
      priceBolts > CONFIG.economy.shops.maxPriceBolts
    ) {
      return 'That asking price will not do.';
    }
    const row = await this.freshRow(stallId, now);
    if (row.ownerAccountId !== accountId) return 'Not your stall.';
    const stock = parseStock(row.stockJson);
    const line = stock[lineIdx];
    if (line === undefined) return 'Nothing there.';
    line.priceBolts = priceBolts;
    const ok = await this.guarded(stallId, row.version, { stockJson: stock as unknown as object[] });
    return ok ? null : 'The stall ledger is busy — try again.';
  }

  /**
   * A purchase against the escrowed stock. The caller already TOOK the
   * gross Bolts from the buyer (synchronously) and refunds on error; on
   * success the net lands in the cashbox, the fee is destroyed (sink),
   * and the goods belong to the buyer. Works with the owner offline —
   * that's the point.
   */
  async buy(
    stallId: number,
    buyerAccountId: string,
    lineIdx: number,
    qty: number,
    now: number,
  ): Promise<{ error: string } | { bought: StockLine; gross: number; fee: number; net: number }> {
    const row = await this.freshRow(stallId, now);
    if (row.ownerAccountId === null) return { error: 'That stall stands empty.' };
    if (row.ownerAccountId === buyerAccountId) return { error: 'It is your own counter.' };
    const stock = parseStock(row.stockJson);
    const line = stock[lineIdx];
    if (line === undefined) return { error: 'That shelf just emptied.' };
    const take = Math.min(Math.max(1, Math.floor(qty)), line.qty);
    const gross = line.priceBolts * take;
    const fee = Math.ceil(gross * CONFIG.economy.shops.saleFeeFraction);
    const net = gross - fee;
    line.qty -= take;
    const next = stock.filter((l) => l.qty > 0);
    const ok = await this.guarded(stallId, row.version, {
      stockJson: next as unknown as object[],
      cashboxBolts: { increment: net },
      awaySaleBolts: { increment: net },
    });
    if (!ok) return { error: 'Someone beat you to the counter — try again.' };
    const bought: StockLine = { ...line, qty: take };
    // Ledger: buyer paid gross; owner's cashbox gained net; fee destroyed.
    ledger.log({
      type: 'trade',
      account: buyerAccountId,
      data: {
        side: 'shopBuy',
        stallId,
        ownerAccountId: row.ownerAccountId,
        itemId: bought.itemId,
        qty: take,
        bolts: -gross,
      },
    });
    ledger.log({
      type: 'trade',
      account: row.ownerAccountId,
      data: {
        side: 'shopSale',
        stallId,
        buyerAccountId,
        itemId: bought.itemId,
        qty: take,
        netBolts: net,
      },
    });
    ledger.log({
      type: 'spend',
      account: row.ownerAccountId,
      data: { sink: 'shopFee', stallId, bolts: fee },
    });
    return { bought, gross, fee, net };
  }

  /** Empty the cashbox into the owner's hands; returns the amount. */
  async collect(
    stallId: number,
    accountId: string,
    now: number,
  ): Promise<{ error: string } | { bolts: number }> {
    const row = await this.freshRow(stallId, now);
    if (row.ownerAccountId !== accountId) return { error: 'Not your cashbox.' };
    if (row.cashboxBolts <= 0) return { error: 'The cashbox is empty.' };
    const amount = row.cashboxBolts;
    const ok = await this.guarded(stallId, row.version, { cashboxBolts: 0, awaySaleBolts: 0 });
    if (!ok) return { error: 'The stall ledger is busy — try again.' };
    return { bolts: amount };
  }

  /** Pending mailbox deliveries for an account (expired-stall returns). */
  async returnsFor(accountId: string): Promise<MailDelivery[]> {
    const rows = await prisma.stallReturn.findMany({ where: { accountId } });
    return rows.map((r) => ({
      id: r.id,
      bolts: r.boltsAmount,
      stock: parseStock(r.stockJson).map((l) => ({
        itemId: l.itemId,
        qty: l.qty,
        ...(l.durability === undefined ? {} : { durability: l.durability }),
      })),
      reason: r.reason,
    }));
  }

  /** Settle a delivery: clear it, or keep what couldn't fit for next time. */
  async settleReturn(
    id: string,
    leftover: Array<{ itemId: ItemId; qty: number; durability?: number }>,
  ): Promise<void> {
    if (leftover.length === 0) {
      await prisma.stallReturn.delete({ where: { id } }).catch(() => undefined);
    } else {
      await prisma.stallReturn.update({
        where: { id },
        data: {
          boltsAmount: 0,
          stockJson: leftover.map((l) => ({ ...l, priceBolts: 0 })) as unknown as object[],
        },
      });
    }
  }

  /** Park overflow goods for a Spark (pack was full at delivery time). */
  async parkOverflow(
    accountId: string,
    items: Array<{ itemId: ItemId; qty: number; durability?: number }>,
    reason: string,
  ): Promise<void> {
    await prisma.stallReturn.create({
      data: {
        accountId,
        boltsAmount: 0,
        stockJson: items.map((l) => ({ ...l, priceBolts: 0 })) as unknown as object[],
        reason,
      },
    });
  }
}

export const shops = new ShopService();

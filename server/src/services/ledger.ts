import { prisma } from './db.js';

export interface LedgerEntry {
  type:
    | 'gather'
    | 'glint'
    | 'trophy'
    | 'trade'
    | 'spend'
    | 'quest'
    | 'anomaly'
    | 'cosmetic'
    | 'system';
  account: string;
  data: Record<string, unknown>;
}

/**
 * The economy ledger habit (CLAUDE.md golden rule 9 / conventions): every
 * value movement gets appended — source of truth for the balance dashboard,
 * the City Ledger, and trade-anomaly detection later. Writes are
 * fire-and-forget so gameplay never blocks on the ledger.
 */
class Ledger {
  log(entry: LedgerEntry): void {
    const ts = new Date();
    // Console mirror for dev visibility.
    console.log(`[ledger] ${ts.toISOString()} ${entry.type} ${entry.account}`, entry.data);
    void prisma.ledgerEvent
      .create({
        data: { type: entry.type, accountId: entry.account, data: entry.data as object },
      })
      .catch((err: unknown) => {
        console.error('[ledger] write failed', err);
      });
  }
}

export const ledger = new Ledger();

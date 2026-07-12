import {
  completedPages,
  FULL_MANIFEST_TITLE,
  FULL_MANIFEST_TRIM,
  MANIFEST_BY_ID,
  manifestComplete,
  PAGE_AWARDS,
} from '@shared/manifest';
import { prisma } from './db.js';

/**
 * The Manifest service (S1): account-wide discovery log. All writes are
 * server-side, driven by the SAME grant paths that hand out the underlying
 * things — nothing here is client-claimable. Untradeable, ever.
 */

export interface ManifestRow {
  entryId: string;
  count: number;
  firstAtMs: number;
}

export interface RecordResult {
  first: boolean;
  count: number;
  /** Titles newly earned by this discovery (page/full completion). */
  newTitles: string[];
  /** True when this discovery completed the WHOLE Manifest (trim time). */
  fullComplete: boolean;
}

export async function loadManifest(accountId: string): Promise<ManifestRow[]> {
  const rows = await prisma.manifestEntry.findMany({ where: { accountId } });
  return rows.map((r) => ({
    entryId: r.entryId,
    count: r.count,
    firstAtMs: r.firstAt.getTime(),
  }));
}

/**
 * Tick an entry (grant-path only). Returns discovery/completion facts so
 * the room can toast, chime, and award titles — or null for unknown ids.
 */
export async function recordEntry(
  accountId: string,
  entryId: string,
  titlesOwned: readonly string[],
): Promise<RecordResult | null> {
  if (MANIFEST_BY_ID[entryId] === undefined) return null;
  const existing = await prisma.manifestEntry.findUnique({
    where: { accountId_entryId: { accountId, entryId } },
  });
  if (existing !== null) {
    const updated = await prisma.manifestEntry.update({
      where: { accountId_entryId: { accountId, entryId } },
      data: { count: { increment: 1 } },
    });
    return { first: false, count: updated.count, newTitles: [], fullComplete: false };
  }
  await prisma.manifestEntry.create({ data: { accountId, entryId } });

  // Completion checks on the fresh discovered set.
  const discovered = new Set(
    (await prisma.manifestEntry.findMany({ where: { accountId } })).map((r) => r.entryId),
  );
  const newTitles: string[] = [];
  const entry = MANIFEST_BY_ID[entryId];
  for (const award of PAGE_AWARDS) {
    if (award.page !== entry?.page) continue;
    if (!titlesOwned.includes(award.title) && completedPages(discovered).includes(award.page)) {
      newTitles.push(award.title);
    }
  }
  const fullComplete = manifestComplete(discovered) && !titlesOwned.includes(FULL_MANIFEST_TITLE);
  if (fullComplete) newTitles.push(FULL_MANIFEST_TITLE);
  return { first: true, count: 1, newTitles, fullComplete };
}

export { FULL_MANIFEST_TRIM };

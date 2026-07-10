import { prisma } from './db.js';

/**
 * Moderation minimum (H2): per-account mutes (persisted — the muted are
 * never told) and /report rows for the weekly review habit. A dev script
 * (server/scripts/list-reports.ts) reads the reports; no admin UI yet.
 */

export const moderation = {
  /** Muted account ids for one account (loaded once per join). */
  async loadMutes(accountId: string): Promise<Set<string>> {
    const rows = await prisma.mute.findMany({
      where: { accountId },
      select: { mutedAccountId: true },
    });
    return new Set(rows.map((r) => r.mutedAccountId));
  },

  /** Resolve a Spark name to its account id (case-insensitive). */
  async accountByName(sparkName: string): Promise<{ id: string; name: string } | null> {
    const ch = await prisma.character.findFirst({
      where: { sparkName: { equals: sparkName, mode: 'insensitive' } },
      select: { accountId: true, sparkName: true },
    });
    return ch === null ? null : { id: ch.accountId, name: ch.sparkName };
  },

  async mute(accountId: string, mutedAccountId: string): Promise<void> {
    await prisma.mute.upsert({
      where: { accountId_mutedAccountId: { accountId, mutedAccountId } },
      create: { accountId, mutedAccountId },
      update: {},
    });
  },

  async unmute(accountId: string, mutedAccountId: string): Promise<void> {
    await prisma.mute.deleteMany({ where: { accountId, mutedAccountId } });
  },

  async report(
    reporterId: string,
    reportedId: string,
    reportedName: string,
    reason: string,
  ): Promise<void> {
    await prisma.report.create({
      data: { reporterId, reportedId, reportedName, reason: reason.slice(0, 500) },
    });
  },
};

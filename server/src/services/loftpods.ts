import { prisma } from './db.js';

/**
 * Loftpods (D2b) — housing as identity. One pod per account (DB-unique),
 * one pod per berth (DB-unique): the database IS the slot manager, so two
 * Sparks can't claim the same pad even across room instances. Every field
 * is display; every cost the room charges is a sink.
 */

export interface PodView {
  accountId: string;
  ownerName: string;
  berth: number;
  tier: number;
  dye: string;
  trophyTitle: string;
  trophySkill: string;
}

async function toView(pod: {
  accountId: string;
  berth: number;
  tier: number;
  dye: string;
  trophyTitle: string;
  trophySkill: string;
}): Promise<PodView> {
  const ch = await prisma.character.findUnique({
    where: { accountId: pod.accountId },
    select: { sparkName: true },
  });
  return { ...pod, ownerName: ch?.sparkName ?? 'a Spark' };
}

export const loftpods = {
  async getAll(): Promise<PodView[]> {
    const pods = await prisma.loftpod.findMany();
    return Promise.all(pods.map(toView));
  },

  async getMine(accountId: string): Promise<PodView | null> {
    const pod = await prisma.loftpod.findUnique({ where: { accountId } });
    return pod === null ? null : toView(pod);
  },

  /** Claim a berth. Fails if the account has a pod or the berth is taken. */
  async place(accountId: string, berth: number): Promise<PodView | string> {
    try {
      const pod = await prisma.loftpod.create({ data: { accountId, berth } });
      return await toView(pod);
    } catch {
      return 'That berth is spoken for (or you already have a home).';
    }
  },

  /** /haul — move an existing pod to a free berth. */
  async haul(accountId: string, berth: number): Promise<PodView | string> {
    try {
      const pod = await prisma.loftpod.update({ where: { accountId }, data: { berth } });
      return await toView(pod);
    } catch {
      return 'That berth is spoken for.';
    }
  },

  async upgrade(accountId: string, toTier: number): Promise<PodView | string> {
    try {
      const pod = await prisma.loftpod.update({
        where: { accountId },
        data: { tier: toTier },
      });
      return await toView(pod);
    } catch {
      return 'No pod to upgrade.';
    }
  },

  async decorate(
    accountId: string,
    data: Partial<{ dye: string; trophyTitle: string; trophySkill: string }>,
  ): Promise<PodView | string> {
    try {
      const pod = await prisma.loftpod.update({ where: { accountId }, data });
      return await toView(pod);
    } catch {
      return 'No pod to decorate.';
    }
  },
};

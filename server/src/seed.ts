import 'dotenv/config';
import { CONFIG } from '@shared/config';
import { prisma } from './services/db.js';

/**
 * Cold-start seed (deploy prep D5). Run AFTER `prisma migrate deploy`,
 * BEFORE (or any time during) serving:  node server/dist/seed.mjs
 *
 * AMPERIA's world/districts/NPC merchants/quests all live in /shared config
 * (CLAUDE.md: config-driven, no magic rows), and every per-player row is
 * created lazily by the server — so a fresh database needs almost nothing.
 * What this seed does:
 *
 *  1. Pre-warms one MerchantState row per tradeable resource (pressure 0)
 *     so first-day trading doesn't lazily race band creation. IDEMPOTENT:
 *     existing rows are left exactly as they are (update: {}) — running
 *     this against a LIVE database never resets live band pressure.
 *  2. Prints a table census so the operator can eyeball the cold start.
 *
 * Safe to run twice; safe to run on a populated database.
 */
async function main(): Promise<void> {
  const resources = Object.keys(CONFIG.economy.merchant.buy);
  let created = 0;
  for (const resourceId of resources) {
    const before = await prisma.merchantState.findUnique({ where: { resourceId } });
    await prisma.merchantState.upsert({
      where: { resourceId },
      create: { resourceId, pressure: 0 },
      update: {}, // never touch a live band
    });
    if (before === null) created += 1;
  }
  console.log(
    `[seed] MerchantState: ${created} created, ${resources.length - created} already present ` +
      `(${resources.join(', ')})`,
  );

  const [accounts, characters, stalls, ledger] = await Promise.all([
    prisma.account.count(),
    prisma.character.count(),
    prisma.shopStall.count(),
    prisma.ledgerEvent.count(),
  ]);
  console.log(
    `[seed] census — accounts ${accounts} · characters ${characters} · stalls ${stalls} · ledger events ${ledger}`,
  );
  console.log('[seed] done — world/districts/NPCs are config-driven (/shared), no rows needed');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error('[seed] failed:', err instanceof Error ? err.message : err);
    await prisma.$disconnect();
    process.exit(1);
  });

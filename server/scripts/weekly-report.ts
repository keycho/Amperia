/**
 * H5 BALANCE WATCH — the weekly tuning habit as ONE command.
 * Run from /server: npx tsx scripts/weekly-report.ts [days]
 *
 * Combines the economy ledger (measure-economy's classification) with the
 * character table into a single report for the window: sink/faucet ratio,
 * median + P90 Bolts, top sinks and faucets, trade + anomaly counts, and
 * the nightly rollup trail.
 *
 * ── THE PRE-COMMITTED LEVERS (Economy Design §5 — pull these, only these) ──
 *  1. NPC band ceiling/floor per resource   CONFIG.economy.merchant.buy
 *  2. Band slide rate (sale-volume price decay + recovery)
 *  3. Gear repair rate / durability wear    CONFIG.crafting / tools wear
 *  4. Shop stall rent                       CONFIG.shops.rentBolts
 *  5. Tram toll per hop                     CONFIG.travel.tollBolts
 *  6. Coil paid-spin price (Bolts)          CONFIG.coil
 *  7. Loftpod costs (place/haul/upgrade)    CONFIG.loftpods
 * Rule of thumb: pull ONE lever per week, only when the steady-state
 * sink/faucet ratio runs below ~0.8 or median Bolts climbs >20% w/w.
 */
import { prisma } from '../src/services/db.js';

const days = Number(process.argv[2] ?? 7);
const since = new Date(Date.now() - days * 24 * 3600 * 1000);

interface Row {
  type: string;
  data: {
    side?: string;
    sink?: string;
    bolts?: number;
    feeBolts?: number;
    questId?: string;
  };
}

const rows = (await prisma.ledgerEvent.findMany({
  where: { ts: { gte: since } },
  select: { type: true, data: true },
})) as unknown as Row[];

const faucets = new Map<string, number>();
const sinks = new Map<string, number>();
let tradeCount = 0;
let anomalyCount = 0;
const bump = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);

for (const r of rows) {
  const d = r.data;
  if (r.type === 'anomaly') anomalyCount += 1;
  if (r.type === 'trade' && d.side === 'direct') tradeCount += 1;
  if (r.type === 'trade' && d.side === 'npcBuys' && typeof d.bolts === 'number') {
    bump(faucets, 'npcSale', d.bolts);
  } else if (r.type === 'quest' && typeof d.bolts === 'number') {
    bump(faucets, `quest:${d.questId ?? '?'}`, d.bolts);
  } else if (r.type === 'trade' && d.side === 'npcSells' && typeof d.bolts === 'number') {
    bump(sinks, 'wareBuy', Math.abs(d.bolts));
  } else if (r.type === 'trade' && d.side === 'scrapcacheReclaim' && typeof d.feeBolts === 'number') {
    bump(sinks, 'scrapcacheFee', d.feeBolts);
  } else if (r.type === 'spend' && typeof d.bolts === 'number') {
    bump(sinks, d.sink ?? 'other', d.bolts);
  }
}

const chars = await prisma.character.findMany({ select: { bolts: true } });
const bolts = chars.map((c) => c.bolts).sort((a, b) => a - b);
const pick = (p: number) => (bolts.length === 0 ? 0 : (bolts[Math.floor(p * (bolts.length - 1))] ?? 0));

const rollups = await prisma.economySummary.findMany({
  orderBy: { date: 'desc' },
  take: days,
});

const total = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
const top = (m: Map<string, number>, n: number) =>
  [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
const f = total(faucets);
const s = total(sinks);

console.log(`══ AMPERIA weekly balance — last ${days} days (${rows.length} ledger rows) ══`);
console.log(`\nsink/faucet ratio : ${f > 0 ? (s / f).toFixed(3) : 'n/a'}  (${s} sunk / ${f} minted)`);
console.log(`Bolts held        : median ${pick(0.5)} · P90 ${pick(0.9)} · Sparks ${bolts.length}`);
console.log(`direct trades     : ${tradeCount}`);
console.log(`anomaly rows      : ${anomalyCount}${anomalyCount > 0 ? '  ← sample these (ledger type=anomaly)' : ''}`);

console.log('\ntop faucets:');
for (const [k, v] of top(faucets, 5)) console.log(`  ${k.padEnd(20)} ${v}`);
console.log('top sinks:');
for (const [k, v] of top(sinks, 5)) console.log(`  ${k.padEnd(20)} ${v}`);

if (rollups.length > 0) {
  console.log('\nnightly rollups (newest first):');
  console.log('  date        faucet   sink    net    growth  trades  anomalies');
  for (const h of rollups) {
    console.log(
      `  ${h.date}  ${String(h.faucetBolts).padStart(6)}  ${String(h.sinkBolts).padStart(6)}  ${String(h.netBolts).padStart(5)}  ${String(h.growthPct).padStart(5)}%  ${String(h.tradeCount).padStart(6)}  ${String(h.anomalyCount).padStart(9)}`,
    );
  }
}
console.log('\nlevers live in the header of this script — one per week, at most.');
await prisma.$disconnect();

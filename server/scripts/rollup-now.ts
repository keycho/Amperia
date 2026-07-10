/**
 * Manual economy rollup + report (E4): writes/updates the EconomySummary
 * row for the PREVIOUS UTC day, then prints a full report for TODAY so
 * far — the numbers PROGRESS.md's weekly economy report pastes in.
 * Run from /server: npx tsx scripts/rollup-now.ts
 */
import { computeTodayMetrics, runNightlyRollup } from '../src/services/metrics.js';
import { prisma } from '../src/services/db.js';

const yesterday = await runNightlyRollup(Date.now());
console.log(`\nrollup row written for ${yesterday.date}`);

const m = await computeTodayMetrics(Date.now());
const fmt = (o: Record<string, number>) =>
  Object.entries(o)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `  ${k.padEnd(20)} ${v}`)
    .join('\n');

console.log(`\n== AMPERIA economy — ${m.date} (UTC, so far) ==`);
console.log(
  `faucets ${m.faucetBolts} B · sinks ${m.sinkBolts} B · net ${m.netBolts} B` +
    ` (${m.growthPct}% of the ${m.supplyBolts} B supply)`,
);
console.log(`sink/faucet ratio: ${m.faucetBolts > 0 ? (m.sinkBolts / m.faucetBolts).toFixed(3) : 'n/a'}`);
console.log(`${m.playerCount} Sparks · median ${m.medianBolts} B · P90 ${m.p90Bolts} B`);
console.log(`\nFAUCETS\n${fmt(m.faucets) || '  (none)'}`);
console.log(`\nSINKS\n${fmt(m.sinks) || '  (none)'}`);
console.log(
  `\nTRADE  direct ${m.tradeCount} trades / ${m.tradeVolumeEst} B est · shop ${m.shopVolumeBolts} B gross · anomalies ${m.anomalyCount}`,
);
console.log(`CHARGE ${m.chargeAmperite} Amperite donated`);
console.log('\nBANDS');
for (const [r, b] of Object.entries(m.bands)) {
  console.log(`  ${r.padEnd(10)} ${b.unit} B (band ${b.floor}-${b.ceiling}, pressure ${b.pressure})`);
}
await prisma.$disconnect();

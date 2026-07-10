/**
 * H2 dev script: list player reports (no admin UI yet — this is the weekly
 * review habit). Prints the most-reported Sparks first, then the recent
 * rows. Run from /server: npx tsx scripts/list-reports.ts [days]
 */
import { prisma } from '../src/services/db.js';

const days = Number(process.argv[2] ?? 30);
const since = new Date(Date.now() - days * 24 * 3600 * 1000);

const reports = await prisma.report.findMany({
  where: { createdAt: { gte: since } },
  orderBy: { createdAt: 'desc' },
});

if (reports.length === 0) {
  console.log(`No reports in the last ${days} days. Quiet city.`);
  process.exit(0);
}

const byReported = new Map<string, { name: string; count: number }>();
for (const rep of reports) {
  const cur = byReported.get(rep.reportedId) ?? { name: rep.reportedName, count: 0 };
  cur.count += 1;
  byReported.set(rep.reportedId, cur);
}

console.log(`── reports, last ${days} days: ${reports.length} rows ──`);
console.log('\nmost reported:');
for (const [id, r] of [...byReported.entries()].sort((a, b) => b[1].count - a[1].count)) {
  console.log(`  ${String(r.count).padStart(3)}× ${r.name}  (${id})`);
}

console.log('\nrecent rows:');
for (const rep of reports.slice(0, 50)) {
  const when = rep.createdAt.toISOString().slice(0, 16).replace('T', ' ');
  console.log(`  ${when}  ${rep.reportedName}  ← ${rep.reporterId.slice(0, 8)}…  "${rep.reason}"`);
}

await prisma.$disconnect();

/**
 * Economy balance readout: classify every Bolts movement in the ledger as
 * faucet (Bolts created) or sink (Bolts destroyed) and print the totals,
 * per-source/per-sink breakdown, and the sink/faucet ratio. Player↔player
 * and player↔cache moves are conservation, not creation — excluded.
 * Run from /server: npx tsx scripts/measure-economy.ts
 */
import { prisma } from '../src/services/db.js';

interface Row {
  type: string;
  data: {
    side?: string;
    sink?: string;
    source?: string;
    bolts?: number;
    feeBolts?: number;
    questId?: string;
  };
}

const rows = (await prisma.ledgerEvent.findMany({
  select: { type: true, data: true },
})) as unknown as Row[];

const faucets = new Map<string, number>();
const sinks = new Map<string, number>();
const bump = (m: Map<string, number>, k: string, v: number) =>
  m.set(k, (m.get(k) ?? 0) + v);

for (const r of rows) {
  const d = r.data;
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

const total = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
const show = (name: string, m: Map<string, number>) => {
  console.log(`${name}: ${total(m)} Bolts`);
  for (const [k, v] of [...m.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(18)} ${v}`);
  }
};

console.log(`ledger rows: ${rows.length}`);
show('FAUCETS (Bolts in)', faucets);
show('SINKS (Bolts out)', sinks);
const f = total(faucets);
const s = total(sinks);
console.log(`sink/faucet ratio: ${f > 0 ? (s / f).toFixed(3) : 'n/a'} (${s}/${f})`);
await prisma.$disconnect();

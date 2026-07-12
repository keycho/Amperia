/**
 * Direct-trade e2e (E1): two live clients exercise the full window flow and
 * every abort path — decline, cancel, stale-offer (no-dupe), timeout, and
 * disconnect. Run the server with TRADE_TIMEOUT_SECONDS=5 so the timeout
 * leg finishes quickly:
 *
 *   TRADE_TIMEOUT_SECONDS=5 npx tsx src/index.ts   # then:
 *   npx tsx scripts/probe-ptrade.ts
 */
import { Client, type Room } from 'colyseus.js';
import { buildWorldMap } from '@shared/map';
import { prisma } from '../src/services/db.js';

const HTTP = 'http://localhost:2567';
const TIMEOUT_S = Number(process.env.TRADE_TIMEOUT_SECONDS ?? 5);

interface Snapshot {
  bolts: number;
  counts: Map<string, number>;
}

interface Probe {
  room: Room;
  token: string;
  name: string;
  inv: Snapshot;
  notices: string[];
  asks: Array<{ tradeId: string; fromName: string; fromSessionId: string }>;
  syncs: Array<{
    tradeId: string;
    you: { bolts: number; items: Array<{ itemId: string; qty: number }>; confirmed: boolean };
    them: { bolts: number; items: Array<{ itemId: string; qty: number }>; confirmed: boolean };
  }>;
  ends: Array<{ tradeId: string; outcome: string }>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(pred: () => boolean, label: string, timeoutMs = 60000): Promise<void> {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > timeoutMs) throw new Error(`timeout: ${label}`);
    await sleep(50);
  }
}

async function join(label: string, token?: string, name?: string): Promise<Probe> {
  let tok = token ?? '';
  let sparkName = name ?? '';
  if (tok === '') {
    const reg = (await fetch(`${HTTP}/auth/guest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    }).then((r) => r.json())) as { token: string; sparkName: string };
    tok = reg.token;
    sparkName = reg.sparkName;
  }
  const room = await new Client(HTTP).joinOrCreate('filament', { token: tok });
  const p: Probe = {
    room,
    token: tok,
    name: sparkName,
    inv: { bolts: -1, counts: new Map() },
    notices: [],
    asks: [],
    syncs: [],
    ends: [],
  };
  room.onMessage(
    'inventory',
    (m: { pack: Array<{ itemId: string; qty: number } | null>; bolts: number }) => {
      p.inv.bolts = m.bolts;
      p.inv.counts = new Map();
      for (const s of m.pack) {
        if (s !== null) p.inv.counts.set(s.itemId, (p.inv.counts.get(s.itemId) ?? 0) + s.qty);
      }
    },
  );
  room.onMessage('notice', (m: { text: string }) => p.notices.push(m.text));
  room.onMessage('tradeAsk', (m: Probe['asks'][0]) => p.asks.push(m));
  room.onMessage('tradeSync', (m: Probe['syncs'][0]) => p.syncs.push(m));
  room.onMessage('tradeEnd', (m: Probe['ends'][0]) => p.ends.push(m));
  room.onMessage('*', () => undefined);
  await until(() => p.inv.bolts >= 0, `${label} joined`);
  console.log(`${label} = ${p.name}`);
  return p;
}

const salvage = (p: Probe) => p.inv.counts.get('salvage') ?? 0;
const lastEnd = (p: Probe) => p.ends[p.ends.length - 1];

function me(p: Probe): { tileX: number; tileY: number } | undefined {
  const st = p.room.state as unknown as {
    players?: { get(id: string): { tileX: number; tileY: number } | undefined };
  };
  return st.players?.get?.(p.room.sessionId);
}

async function moveTo(p: Probe, x: number, y: number): Promise<void> {
  p.room.send('move', { x, y });
  await until(() => me(p)?.tileX === x && me(p)?.tileY === y, `arrive ${x},${y}`);
}

async function gatherSalvage(p: Probe, want: number): Promise<void> {
  const map = buildWorldMap();
  const start = me(p) as { tileX: number; tileY: number };
  // Work the four nearest heaps round-robin so respawn cooldowns overlap
  // (the server walks the Spark between them on each gather intent).
  const heaps = map.nodes
    .filter((n) => n.kind === 'junkHeap')
    .sort(
      (a2, b2) =>
        Math.abs(a2.x - start.tileX) +
        Math.abs(a2.y - start.tileY) -
        (Math.abs(b2.x - start.tileX) + Math.abs(b2.y - start.tileY)),
    )
    .slice(0, 4);
  p.room.send('selectSlot', { slot: 0 });
  const st = () =>
    p.room.state as unknown as {
      nodes?: { get(id: string): { depleted: boolean } | undefined };
    };
  const timer = setInterval(() => {
    if (salvage(p) >= want) return;
    const meNow = me(p) as { gathering?: boolean } | undefined;
    if (meNow?.gathering === true) return;
    const free = heaps.find((h) => st().nodes?.get(String(h.id))?.depleted !== true);
    if (free !== undefined) p.room.send('gather', { nodeId: free.id });
  }, 900);
  await until(() => salvage(p) >= want, `salvage x${want}`, 180000);
  clearInterval(timer);
}

async function openTrade(a: Probe, b: Probe): Promise<string> {
  const asksBefore = b.asks.length;
  a.room.send('ptrade', { action: 'request', targetSessionId: b.room.sessionId });
  await until(() => b.asks.length > asksBefore, 'trade ask arrives');
  return (b.asks[b.asks.length - 1] as Probe['asks'][0]).tradeId;
}

/** Backdate an account (guardrail testing) and optionally set its Bolts. */
async function shapeAccount(sparkName: string, ageDays: number, bolts?: number): Promise<void> {
  const character = await prisma.character.findUniqueOrThrow({ where: { sparkName } });
  await prisma.account.update({
    where: { id: character.accountId },
    data: { createdAt: new Date(Date.now() - ageDays * 86_400_000) },
  });
  if (bolts !== undefined) {
    await prisma.character.update({ where: { sparkName }, data: { bolts } });
  }
}

async function main(): Promise<void> {
  let a = await join('A');
  let b = await join('B');

  // ── 0 · young-account guardrails (E1c) ──────────────────────────────────
  console.log('\n— guardrail: brand-new accounts cannot trade —');
  const noticesBefore = a.notices.length;
  a.room.send('ptrade', { action: 'request', targetSessionId: b.room.sessionId });
  await until(
    () => a.notices.slice(noticesBefore).some((t) => t.includes('settle in')),
    'age-gate refusal',
  );
  if (b.asks.length > 0) throw new Error('age gate let the request through!');
  console.log('age gate refused the fresh Spark ✓');

  console.log('\n— guardrail: young accounts trade under the daily value cap —');
  // Relog as 3-day-old accounts; A gets a fat wallet to stage.
  await a.room.leave();
  await b.room.leave();
  await sleep(1000); // let the leave-persist settle before writing rows
  await shapeAccount(a.name, 3, 5000);
  await shapeAccount(b.name, 3);
  a = await join('A', a.token, a.name);
  b = await join('B', b.token, b.name);
  let tid = await openTrade(a, b);
  b.room.send('ptrade', { action: 'accept', tradeId: tid });
  await until(() => a.syncs.some((s) => s.tradeId === tid), 'window open');
  a.room.send('ptrade', { action: 'stage', tradeId: tid, bolts: 2500, items: [] });
  await sleep(300);
  a.room.send('ptrade', { action: 'confirm', tradeId: tid });
  b.room.send('ptrade', { action: 'confirm', tradeId: tid });
  await until(
    () => a.notices.some((t) => t.includes('young')),
    'young value-cap refusal',
  );
  if (lastEnd(a)?.outcome === 'completed') throw new Error('value cap did not hold!');
  a.room.send('ptrade', { action: 'cancel', tradeId: tid });
  await until(() => lastEnd(a)?.outcome === 'cancelled', 'window closed');
  console.log('young-account daily value cap held ✓');

  // Grown-up accounts for the rest of the flow.
  await a.room.leave();
  await b.room.leave();
  await sleep(1000);
  await shapeAccount(a.name, 30);
  await shapeAccount(b.name, 30);
  a = await join('A', a.token, a.name);
  b = await join('B', b.token, b.name);

  console.log('\n— setup: A gathers salvage —');
  await gatherSalvage(a, 12);
  console.log(`A holds ${salvage(a)} salvage`);
  // Stand together by the gate (request radius is config-checked).
  await moveTo(a, 34, 20);
  await moveTo(b, 34, 21);

  // ── 1 · decline ─────────────────────────────────────────────────────────
  console.log('\n— decline path —');
  let tradeId = await openTrade(a, b);
  b.room.send('ptrade', { action: 'decline', tradeId });
  await until(() => lastEnd(a)?.outcome === 'declined', 'A sees decline');
  console.log('declined ✓');

  // ── 2 · cancel (abort) leaves inventories untouched ────────────────────
  console.log('\n— abort path —');
  const aSalvageBefore = salvage(a);
  const bSalvageBefore = salvage(b);
  tradeId = await openTrade(a, b);
  b.room.send('ptrade', { action: 'accept', tradeId });
  await until(() => a.syncs.some((s) => s.tradeId === tradeId), 'A sees accepted window');
  a.room.send('ptrade', { action: 'stage', tradeId, bolts: 0, items: [{ slot: 0, qty: 5 }] });
  await until(
    () => b.syncs.some((s) => s.tradeId === tradeId && s.them.items.length > 0),
    'B sees staged salvage',
  );
  b.room.send('ptrade', { action: 'cancel', tradeId });
  await until(() => lastEnd(a)?.outcome === 'cancelled', 'A sees cancel');
  await sleep(200);
  if (salvage(a) !== aSalvageBefore || salvage(b) !== bSalvageBefore) {
    throw new Error('abort moved items!');
  }
  console.log('abort left both packs untouched ✓');

  // ── 3 · stale offer can never dupe ──────────────────────────────────────
  console.log('\n— stale-offer (no-dupe) path —');
  tradeId = await openTrade(a, b);
  b.room.send('ptrade', { action: 'accept', tradeId });
  await until(() => a.syncs.some((s) => s.tradeId === tradeId), 'window open');
  // A stages ALL salvage, then burns 6 on a Heatlamp — the offer goes stale
  // (the server clamps the staged qty to the live slot count).
  a.room.send('ptrade', { action: 'stage', tradeId, bolts: 0, items: [{ slot: 0, qty: 999 }] });
  await until(
    () => b.syncs.some((s) => s.tradeId === tradeId && s.them.items.length > 0),
    'B sees the staged salvage',
  );
  const beforeLamp = salvage(a);
  a.room.send('placeHeatlamp', {});
  await until(() => salvage(a) === beforeLamp - 6, 'heatlamp took 6 salvage');
  a.room.send('ptrade', { action: 'confirm', tradeId });
  b.room.send('ptrade', { action: 'confirm', tradeId });
  await until(
    () => a.notices.some((t) => t.includes('stale')) || lastEnd(a)?.outcome === 'completed',
    'stale offer detected',
  );
  if (lastEnd(a)?.outcome === 'completed' && lastEnd(a)?.tradeId === tradeId) {
    throw new Error('stale offer completed — dupe path!');
  }
  console.log('stale offer refused, nothing moved ✓');
  // Re-stage what A actually has (plus Bolts); the swap then completes.
  const aBefore = salvage(a);
  const bBefore = salvage(b);
  const aBoltsBefore = a.inv.bolts;
  const bBoltsBefore = b.inv.bolts;
  a.room.send('ptrade', { action: 'stage', tradeId, bolts: 100, items: [{ slot: 0, qty: 3 }] });
  await sleep(300);
  a.room.send('ptrade', { action: 'confirm', tradeId });
  b.room.send('ptrade', { action: 'confirm', tradeId });
  await until(() => lastEnd(a)?.outcome === 'completed', 'swap completes');
  await until(() => salvage(b) === bBefore + 3 && b.inv.bolts === bBoltsBefore + 100, 'B received goods + Bolts');
  if (salvage(a) !== aBefore - 3 || a.inv.bolts !== aBoltsBefore - 100) {
    throw new Error('A did not pay the goods');
  }
  console.log(
    `completed swap moved exactly 3 salvage + 100 Bolts (A ${aBefore}→${salvage(a)}, B ${bBefore}→${salvage(b)}) ✓`,
  );

  // ── 4 · timeout closes an idle window ───────────────────────────────────
  console.log(`\n— timeout path (${TIMEOUT_S}s idle) —`);
  tradeId = await openTrade(a, b);
  b.room.send('ptrade', { action: 'accept', tradeId });
  await until(() => a.syncs.some((s) => s.tradeId === tradeId), 'window open');
  await until(
    () => lastEnd(a)?.outcome === 'timeout' && lastEnd(b)?.outcome === 'timeout',
    'both sides see timeout',
    (TIMEOUT_S + 10) * 1000,
  );
  console.log('idle window timed out for both ✓');

  // ── 5 · disconnect cancels for the survivor ─────────────────────────────
  console.log('\n— disconnect path —');
  tradeId = await openTrade(a, b);
  b.room.send('ptrade', { action: 'accept', tradeId });
  await until(() => a.syncs.some((s) => s.tradeId === tradeId), 'window open');
  const bSalvageAtDisconnect = salvage(b);
  await a.room.leave();
  await until(() => lastEnd(b)?.outcome === 'disconnected', 'B sees disconnect');
  if (salvage(b) !== bSalvageAtDisconnect) throw new Error('disconnect moved items!');
  console.log('disconnect closed the window, nothing moved ✓');

  console.log('\nPTRADE PROBE PASSED');
  await b.room.leave();
  process.exit(0);
}

main().catch((err) => {
  console.error('PROBE FAILED:', err);
  process.exit(1);
});

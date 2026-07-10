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

const HTTP = 'http://localhost:2567';
const TIMEOUT_S = Number(process.env.TRADE_TIMEOUT_SECONDS ?? 5);

interface Snapshot {
  bolts: number;
  counts: Map<string, number>;
}

interface Probe {
  room: Room;
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

async function join(label: string): Promise<Probe> {
  const reg = (await fetch(`${HTTP}/auth/guest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  }).then((r) => r.json())) as { token: string; sparkName: string };
  const room = await new Client(HTTP).joinOrCreate('filament', { token: reg.token });
  const p: Probe = {
    room,
    name: reg.sparkName,
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
  let best: { id: number; x: number; y: number; d: number } | null = null;
  for (const n of map.nodes) {
    if (n.kind !== 'junkHeap') continue;
    const d = Math.abs(n.x - start.tileX) + Math.abs(n.y - start.tileY);
    if (best === null || d < best.d) best = { id: n.id, x: n.x, y: n.y, d };
  }
  const heap = best as { id: number; x: number; y: number };
  let adj: { x: number; y: number } | null = null;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    if (map.walkable[heap.y + dy]?.[heap.x + dx] === true) {
      adj = { x: heap.x + dx, y: heap.y + dy };
      break;
    }
  }
  if (adj === null) throw new Error('heap unreachable');
  await moveTo(p, adj.x, adj.y);
  p.room.send('selectSlot', { slot: 0 });
  const timer = setInterval(() => {
    if (salvage(p) < want) p.room.send('gather', { nodeId: heap.id });
  }, 1200);
  await until(() => salvage(p) >= want, `salvage x${want}`, 180000);
  clearInterval(timer);
}

async function openTrade(a: Probe, b: Probe): Promise<string> {
  const asksBefore = b.asks.length;
  a.room.send('ptrade', { action: 'request', targetSessionId: b.room.sessionId });
  await until(() => b.asks.length > asksBefore, 'trade ask arrives');
  return (b.asks[b.asks.length - 1] as Probe['asks'][0]).tradeId;
}

async function main(): Promise<void> {
  const a = await join('A');
  const b = await join('B');

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
  // Re-stage what A actually has; the swap then completes.
  const aBefore = salvage(a);
  const bBefore = salvage(b);
  a.room.send('ptrade', { action: 'stage', tradeId, bolts: 0, items: [{ slot: 0, qty: 3 }] });
  await sleep(300);
  a.room.send('ptrade', { action: 'confirm', tradeId });
  b.room.send('ptrade', { action: 'confirm', tradeId });
  await until(() => lastEnd(a)?.outcome === 'completed', 'swap completes');
  await until(() => salvage(b) === bBefore + 3, 'B received the goods');
  if (salvage(a) !== aBefore - 3) throw new Error('A did not pay the goods');
  console.log(`completed swap moved exactly 3 salvage (A ${aBefore}→${salvage(a)}, B ${bBefore}→${salvage(b)}) ✓`);

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

/** Regen probe: take one bite, trot home, confirm the Dynamo mends you;
 *  then gather salvage and rivet a Heatlamp — lamp must appear in state. */
import { Client } from 'colyseus.js';
const HTTP = 'http://localhost:2567';
const reg = await fetch(`${HTTP}/auth/guest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) }).then((r) => r.json() as Promise<{ token: string }>);
const room = await new Client(HTTP).joinOrCreate('filament', { token: reg.token });
let salvage = 0;
const notices: string[] = [];
room.onMessage('notice', (m: { text: string }) => notices.push(m.text));
room.onMessage('inventory', (m: { pack: Array<{ itemId: string; qty: number } | null> }) => {
  salvage = m.pack.reduce((a, s) => (s !== null && s.itemId === 'salvage' ? a + s.qty : a), 0);
});
room.onMessage('*', () => undefined);
const st = () => room.state as unknown as {
  mobs?: { forEach(cb: (v: { tileX: number; tileY: number }, k: string) => void): void };
  lamps?: { forEach(cb: (v: { tileX: number; tileY: number }, k: string) => void): void };
  players?: { get(id: string): { tileX: number; tileY: number; hp: number } | undefined };
};
const me = () => st().players?.get?.(room.sessionId);
const count = (m?: { forEach(cb: (v: unknown, k: string) => void): void }) => { let n = 0; m?.forEach(() => n++); return n; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (pred: () => boolean, label: string, timeoutMs = 90000) => {
  const t0 = Date.now();
  while (!pred()) { if (Date.now() - t0 > timeoutMs) throw new Error('timeout: ' + label); await sleep(60); }
};
await until(() => me() !== undefined && count(st().mobs) > 0, 'joined');

// One bite, then run home.
let firstMob: { tileX: number; tileY: number } | null = null;
st().mobs?.forEach((v, k) => { if (firstMob === null) firstMob = v; });
const fm = firstMob as unknown as { tileX: number; tileY: number };
room.send('move', { x: fm.tileX, y: fm.tileY - 1 });
const hp0 = (me() as { hp: number }).hp;
await until(() => (me()?.hp ?? hp0) < hp0, 'bitten');
console.log('bitten at', me()?.hp);
room.send('move', { x: 20, y: 24 });
await until(() => me()?.tileX === 20 && me()?.tileY === 24, 'home');
const hpHome = (me() as { hp: number }).hp;
await until(() => (me()?.hp ?? 0) > hpHome, 'dynamo regen', 20000);
console.log(`dynamo warmth mends: ${hpHome} -> ${me()?.hp}`);

// Gather salvage until 6+, then rivet a lamp.
const heap = { id: -1, x: 0, y: 0 };
// node ids: heaps are the first 15 ids by construction; ask via gather attempts:
// walk pattern — use known map: junk heaps scattered; easiest is to read map from shared.
const { buildWorldMap } = await import('@shared/map');
const map = buildWorldMap();
const myT = me() as { tileX: number; tileY: number };
let best: { id: number; x: number; y: number; d: number } | null = null;
for (const n of map.nodes) {
  if (n.kind !== 'junkHeap') continue;
  const d = Math.abs(n.x - 20) + Math.abs(n.y - 24);
  if (best === null || d < best.d) best = { id: n.id, x: n.x, y: n.y, d };
}
const target = best as { id: number; x: number; y: number };
for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
  if (map.walkable[target.y + dy]?.[target.x + dx] === true) { heap.x = target.x + dx; heap.y = target.y + dy; break; }
}
heap.id = target.id;
console.log('gathering at heap', heap.id);
room.send('move', { x: heap.x, y: heap.y });
await until(() => me()?.tileX === heap.x && me()?.tileY === heap.y, 'at heap');
room.send('selectSlot', { slot: 0 });
await sleep(200);
const regather = setInterval(() => { if (salvage < 6) room.send('gather', { nodeId: heap.id }); }, 1200);
await until(() => salvage >= 6, 'salvage x6', 120000);
clearInterval(regather);
console.log('salvage:', salvage);
room.send('placeHeatlamp', {});
await until(() => count(st().lamps) > 0, 'lamp in state', 15000);
await until(() => notices.some((n) => n.includes('hums to life')), 'lamp notice', 5000);
console.log('lamp placed; salvage now', salvage);
await sleep(400);
if (salvage > 0 && salvage < 6) console.log('sink took 6 salvage ✓');
console.log('HEAL PROBE PASSED');
await room.leave();
process.exit(0);

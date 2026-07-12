/**
 * C5 integration probe: session persistence across relog and districts.
 * One Spark: quest accepted → gather (Mastery XP + tool wear) → sell
 * (Bolts + quest progress), then verify EVERYTHING survives:
 *  A. plain relog into the Filament (bolts, pack, durability, quest
 *     state+progress, skill xp, standing tile);
 *  B. tram to the Tangle (same, minus exactly the toll);
 *  C. relog straight into the Tangle (no second toll, nothing lost);
 *  D. tram home.
 */
import { Client, type Room } from 'colyseus.js';
import { CONFIG } from '@shared/config';
import { buildDistrictMap, type DistrictId } from '@shared/map';

const HTTP = 'http://localhost:2567';

interface Slot {
  itemId: string;
  qty: number;
  durability?: number;
}

interface Session {
  room: Room;
  bolts: () => number;
  pack: () => Array<Slot | null>;
  hotbar: () => Array<Slot | null>;
  skills: () => Record<string, number>;
  quests: () => Record<string, { state: string; progress: number }>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function join(token: string, district: DistrictId): Promise<Session> {
  const room = await new Client(HTTP).joinOrCreate(district, { token });
  let bolts = -1;
  let pack: Array<Slot | null> = [];
  let hotbar: Array<Slot | null> = [];
  let skills: Record<string, number> = {};
  let quests: Record<string, { state: string; progress: number }> = {};
  room.onMessage(
    'inventory',
    (m: { pack: Array<Slot | null>; hotbar: Array<Slot | null>; bolts: number }) => {
      bolts = m.bolts;
      pack = m.pack;
      hotbar = m.hotbar;
    },
  );
  room.onMessage('skills', (m: { xp: Record<string, number> }) => (skills = m.xp));
  room.onMessage(
    'quests',
    (m: { log: Record<string, { state: string; progress: number }> }) => (quests = m.log),
  );
  room.onMessage('*', () => undefined);
  return {
    room,
    bolts: () => bolts,
    pack: () => pack,
    hotbar: () => hotbar,
    skills: () => skills,
    quests: () => quests,
  };
}

function meOf(s: Session): { tileX: number; tileY: number } | undefined {
  const st = s.room.state as unknown as {
    players?: { get(id: string): { tileX: number; tileY: number } | undefined };
  };
  return st.players?.get?.(s.room.sessionId);
}

async function until(pred: () => boolean, label: string, timeoutMs = 240000): Promise<void> {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > timeoutMs) throw new Error(`timeout: ${label}`);
    await sleep(80);
  }
}

interface Snapshot {
  bolts: number;
  salvage: number;
  magclawDurability: number | undefined;
  scavvingXp: number;
  tut1: { state: string; progress: number } | undefined;
  tile: { x: number; y: number };
}

function snap(s: Session): Snapshot {
  const me = meOf(s)!;
  const claw = s.hotbar().find((sl) => sl?.itemId === 'magclaw');
  return {
    bolts: s.bolts(),
    salvage: s.pack().reduce((a, sl) => (sl?.itemId === 'salvage' ? a + sl.qty : a), 0),
    magclawDurability: claw?.durability,
    scavvingXp: s.skills().scavving ?? 0,
    tut1: s.quests().tut1,
    tile: { x: me.tileX, y: me.tileY },
  };
}

function expectEqual(label: string, a: unknown, b: unknown): void {
  const ja = JSON.stringify(a);
  const jb = JSON.stringify(b);
  if (ja !== jb) throw new Error(`${label} mismatch: ${ja} != ${jb}`);
}

async function main(): Promise<void> {
  const reg = await fetch(`${HTTP}/auth/guest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  }).then((r) => r.json() as Promise<{ token: string; district: string }>);
  expectEqual('fresh auth district', reg.district, 'filament');

  const fmap = buildDistrictMap('filament');
  let s = await join(reg.token, 'filament');
  await until(() => meOf(s) !== undefined && s.bolts() >= 0, 'join');
  const moveTo = async (x: number, y: number) => {
    s.room.send('move', { x, y });
    const t0 = Date.now();
    let last = t0;
    while (!(meOf(s)?.tileX === x && meOf(s)?.tileY === y)) {
      if (Date.now() - t0 > 240000) throw new Error(`timeout: arrive ${x},${y}`);
      if (Date.now() - last > 3000) {
        s.room.send('move', { x, y });
        last = Date.now();
      }
      await sleep(80);
    }
  };
  const seatNear = (x: number, y: number, r: number) => {
    for (let rad = 1; rad <= r; rad++) {
      for (let dy = -rad; dy <= rad; dy++) {
        for (let dx = -rad; dx <= rad; dx++) {
          if (fmap.walkable[y + dy]?.[x + dx] === true) return { x: x + dx, y: y + dy };
        }
      }
    }
    throw new Error(`no seat near ${x},${y}`);
  };
  const salvage = () =>
    s.pack().reduce((a, sl) => (sl?.itemId === 'salvage' ? a + sl.qty : a), 0);

  // Build up state worth preserving: quest active → gather → sell.
  const disp = fmap.props.find((p) => p.kind === 'dispatcher')!;
  const dseat = seatNear(disp.x, disp.y, 3);
  await moveTo(dseat.x, dseat.y);
  s.room.send('quest', { action: 'accept', id: 'tut1' });
  await until(() => s.quests().tut1?.state === 'active', 'tut1 active', 10000);

  s.room.send('selectSlot', { slot: 0 });
  await sleep(150);
  const heaps = fmap.nodes
    .filter((n) => n.kind === 'junkHeap')
    .map((n) => ({ ...n, d: Math.abs(n.x - 20) + Math.abs(n.y - 20) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 6);
  const stf = () =>
    s.room.state as unknown as {
      nodes?: { get(id: string): { depleted: boolean } | undefined };
    };
  const timer = setInterval(() => {
    if (salvage() >= 8) return;
    const live = heaps.find((n) => stf().nodes?.get(String(n.id))?.depleted === false);
    if (live !== undefined) s.room.send('gather', { nodeId: live.id });
  }, 1400);
  await until(() => salvage() >= 8, 'salvage x8', 360000);
  clearInterval(timer);

  const stand = fmap.props.find((p) => p.kind === 'merchant')!;
  const mseat = seatNear(stand.x, stand.y, 3);
  await moveTo(mseat.x, mseat.y);
  const b0 = s.bolts();
  s.room.send('trade', { action: 'sellResource', itemId: 'salvage', qty: 4 });
  await until(() => s.bolts() > b0, 'sale lands', 15000);

  const a = snap(s);
  if (a.magclawDurability === undefined) throw new Error('magclaw durability missing');
  if (a.magclawDurability >= CONFIG.gear.maxDurability[1]) {
    throw new Error('gathering should have worn the magclaw');
  }
  if (a.scavvingXp <= 0) throw new Error('scavving xp missing');
  if ((a.tut1?.progress ?? 0) < 8) throw new Error('tut1 progress missing');
  console.log('state built ✓', JSON.stringify(a));

  // A. Plain relog into the Filament.
  await s.room.leave();
  await sleep(800); // give the server's onLeave persist a beat, like a human would
  s = await join(reg.token, 'filament');
  await until(() => meOf(s) !== undefined && s.bolts() >= 0 && s.skills().scavving !== undefined, 'relog');
  expectEqual('relog snapshot', snap(s), a);
  console.log('relog ✓ — everything held');

  // B. Tram to the Tangle (exactly the toll comes off).
  const gate = fmap.props.find((p) => p.kind === 'tramgate')!;
  const gseat = seatNear(gate.x, gate.y, 4);
  await moveTo(gseat.x, gseat.y);
  let go = '';
  s.room.onMessage('travelGo', (m: { to: string }) => (go = m.to));
  s.room.send('travel', { to: 'tangle' });
  await until(() => go === 'tangle', 'travelGo', 10000);
  await s.room.leave();
  await sleep(300);
  s = await join(reg.token, 'tangle');
  await until(() => meOf(s) !== undefined && s.bolts() >= 0 && s.skills().scavving !== undefined, 'tangle join');
  const b = snap(s);
  expectEqual('tangle bolts', b.bolts, a.bolts - CONFIG.travel.tollBolts);
  expectEqual('tangle salvage', b.salvage, a.salvage);
  expectEqual('tangle durability', b.magclawDurability, a.magclawDurability);
  expectEqual('tangle scavving', b.scavvingXp, a.scavvingXp);
  expectEqual('tangle tut1', b.tut1, a.tut1);
  expectEqual('tangle gate arrival', b.tile, CONFIG.travel.tangleSpawn);
  console.log('travel ✓ — toll only, state held');

  // C. Relog straight into the Tangle: no second toll, nothing lost.
  await s.room.leave();
  await sleep(800);
  s = await join(reg.token, 'tangle');
  await until(() => meOf(s) !== undefined && s.bolts() >= 0 && s.skills().scavving !== undefined, 'tangle relog');
  expectEqual('tangle relog snapshot', snap(s), b);
  console.log('tangle relog ✓ — no double toll, everything held');

  // D. Tram home.
  const tmap = buildDistrictMap('tangle');
  const tgate = tmap.props.find((p) => p.kind === 'tramgate')!;
  const home = (() => {
    for (let rad = 1; rad <= 4; rad++) {
      for (let dy = -rad; dy <= rad; dy++) {
        for (let dx = -rad; dx <= rad; dx++) {
          const t = { x: tgate.x + 2 + dx, y: tgate.y + 2 + dy };
          if (tmap.walkable[t.y]?.[t.x] === true) return t;
        }
      }
    }
    throw new Error('no seat by the tangle gate');
  })();
  await moveTo(home.x, home.y);
  go = '';
  s.room.onMessage('travelGo', (m: { to: string }) => (go = m.to));
  s.room.send('travel', { to: 'filament' });
  await until(() => go === 'filament', 'travelGo home', 10000);
  await s.room.leave();
  await sleep(300);
  s = await join(reg.token, 'filament');
  await until(() => meOf(s) !== undefined && s.bolts() >= 0, 'home join');
  expectEqual('home bolts', s.bolts(), b.bolts - CONFIG.travel.tollBolts);
  console.log('home ✓');

  console.log('SESSION PROBE PASSED');
  await s.room.leave();
  process.exit(0);
}

main().catch((err) => {
  console.error('PROBE FAILED:', err);
  process.exit(1);
});

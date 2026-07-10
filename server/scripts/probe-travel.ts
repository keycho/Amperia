/**
 * C4 e2e: tram travel + the Tangle + Scrapcache death loop.
 *  1. Earn Bolts in the Filament (sell salvage), pay the tram toll.
 *  2. Join the Tangle: junkhounds present, inventory/Bolts carried over,
 *     arrival is at the Tangle gate (not the old Filament coordinates).
 *  3. Walk into the mob box and get knocked flat → a Scrapcache appears
 *     holding the carried resources + Bolts (hotbar gear stays put).
 *  4. Walk back and reclaim (fee comes out of the cache's Bolts). Dying
 *     again en route is survivable: empty pockets drop no second cache,
 *     and any post-reclaim re-drop is reclaimed in the same loop.
 *  5. Ride the tram home to the Filament.
 */
import { Client, type Room } from 'colyseus.js';
import { CONFIG } from '@shared/config';
import { buildDistrictMap, type DistrictId, type WorldMap } from '@shared/map';

const HTTP = 'http://localhost:2567';

interface Slot {
  itemId: string;
  qty: number;
}

interface Ctx {
  room: Room;
  bolts: () => number;
  pack: () => Array<Slot | null>;
  hotbar: () => Array<Slot | null>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function joinDistrict(token: string, district: DistrictId): Promise<Ctx> {
  const room = await new Client(HTTP).joinOrCreate(district, { token });
  let bolts = -1;
  let pack: Array<Slot | null> = [];
  let hotbar: Array<Slot | null> = [];
  room.onMessage(
    'inventory',
    (m: { pack: Array<Slot | null>; hotbar: Array<Slot | null>; bolts: number }) => {
      bolts = m.bolts;
      pack = m.pack;
      hotbar = m.hotbar;
    },
  );
  room.onMessage('*', () => undefined);
  return { room, bolts: () => bolts, pack: () => pack, hotbar: () => hotbar };
}

function stateOf(room: Room) {
  return room.state as unknown as {
    players?: {
      get(id: string): { tileX: number; tileY: number; hp: number } | undefined;
    };
    nodes?: { get(id: string): { depleted: boolean } | undefined };
    mobs?: {
      forEach(cb: (m: { kind: string; tileX: number; tileY: number }, id: string) => void): void;
    };
    caches?: {
      forEach(cb: (c: { tileX: number; tileY: number }, id: string) => void): void;
    };
  };
}

async function until(pred: () => boolean, label: string, timeoutMs = 240000): Promise<void> {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > timeoutMs) throw new Error(`timeout: ${label}`);
    await sleep(80);
  }
}

/** Nearest walkable tile to (x,y) in a spiral (radius 0 = the tile itself). */
function seatNear(map: WorldMap, x: number, y: number, r: number): { x: number; y: number } {
  for (let rad = 0; rad <= r; rad++) {
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        if (map.walkable[y + dy]?.[x + dx] === true) return { x: x + dx, y: y + dy };
      }
    }
  }
  throw new Error(`no seat near ${x},${y}`);
}

async function main(): Promise<void> {
  const reg = await fetch(`${HTTP}/auth/guest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  }).then((r) => r.json() as Promise<{ token: string }>);

  const fmap = buildDistrictMap('filament');
  const tmap = buildDistrictMap('tangle');

  // ── 1. Filament: earn toll + fee headroom ───────────────────────────────
  let ctx = await joinDistrict(reg.token, 'filament');
  let st = () => stateOf(ctx.room);
  let me = () => st().players?.get?.(ctx.room.sessionId);
  await until(() => me() !== undefined && ctx.bolts() >= 0, 'filament join');

  const count = (id: string) =>
    ctx.pack().reduce((a, s) => (s?.itemId === id ? a + s.qty : a), 0);
  // Resilient walk: re-send the intent until arrival (survives being downed
  // and hauled back mid-path — the next resend just paths from the gate).
  const moveTo = async (x: number, y: number, timeoutMs = 240000) => {
    ctx.room.send('move', { x, y });
    const t0 = Date.now();
    let lastSend = Date.now();
    while (!(me()?.tileX === x && me()?.tileY === y)) {
      if (Date.now() - t0 > timeoutMs) throw new Error(`timeout: arrive ${x},${y}`);
      if (Date.now() - lastSend > 3000) {
        ctx.room.send('move', { x, y });
        lastSend = Date.now();
      }
      await sleep(80);
    }
  };

  const toll = CONFIG.travel.tollBolts;
  const fee = CONFIG.tangle.scrapcache.reclaimFeeBolts;
  const needed = toll * 2 + fee * 2; // both tolls + up to two reclaim fees
  const heaps = fmap.nodes
    .filter((n) => n.kind === 'junkHeap')
    .map((n) => ({ ...n, d: Math.abs(n.x - 20) + Math.abs(n.y - 20) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 6);
  const gatherSalvage = async (target: number) => {
    ctx.room.send('selectSlot', { slot: 0 });
    await sleep(150);
    const timer = setInterval(() => {
      if (count('salvage') >= target) return;
      const live = heaps.find((n) => st().nodes?.get(String(n.id))?.depleted === false);
      if (live !== undefined) ctx.room.send('gather', { nodeId: live.id });
    }, 1400);
    await until(() => count('salvage') >= target, `salvage x${target}`, 360000);
    clearInterval(timer);
  };
  const stand = fmap.props.find((p) => p.kind === 'merchant')!;
  const standSeat = seatNear(fmap, stand.x, stand.y, 3);
  // Earn until the run is funded, whatever the band price happens to be.
  while (ctx.bolts() < needed) {
    await gatherSalvage(12);
    await moveTo(standSeat.x, standSeat.y);
    const before = ctx.bolts();
    ctx.room.send('trade', { action: 'sellResource', itemId: 'salvage', qty: 12 });
    await until(() => ctx.bolts() > before, 'sale lands', 15000);
  }
  // Carry a couple of salvage so the death-drop has resources to hold.
  if (count('salvage') < 2) await gatherSalvage(2);
  const boltsBeforeTravel = ctx.bolts();
  const packSalvage = count('salvage');
  const hotbarBefore = ctx.hotbar().filter((s) => s !== null).length;

  // ── 2. Pay the toll at the gate ─────────────────────────────────────────
  const gate = fmap.props.find((p) => p.kind === 'tramgate')!;
  const gseat = seatNear(fmap, gate.x, gate.y, 4);
  await moveTo(gseat.x, gseat.y);
  let travelTo = '';
  ctx.room.onMessage('travelGo', (m: { to: string }) => (travelTo = m.to));
  ctx.room.send('travel', { to: 'tangle' });
  await until(() => travelTo === 'tangle', 'travelGo', 10000);
  const boltsAfterToll = ctx.bolts();
  if (boltsAfterToll !== boltsBeforeTravel - toll) {
    throw new Error(`toll mismatch: ${boltsBeforeTravel} -> ${boltsAfterToll}`);
  }
  console.log(`toll paid ✓ (${boltsBeforeTravel} → ${boltsAfterToll} B)`);
  await ctx.room.leave();

  // ── 3. The Tangle: gate arrival, junkhounds live, inventory persisted ───
  ctx = await joinDistrict(reg.token, 'tangle');
  st = () => stateOf(ctx.room);
  me = () => st().players?.get?.(ctx.room.sessionId);
  await until(() => me() !== undefined && ctx.bolts() >= 0, 'tangle join');
  const spawn = CONFIG.travel.tangleSpawn;
  if (me()?.tileX !== spawn.x || me()?.tileY !== spawn.y) {
    throw new Error(
      `should arrive at the Tangle gate (${spawn.x},${spawn.y}), got ${me()?.tileX},${me()?.tileY}`,
    );
  }
  if (ctx.bolts() !== boltsAfterToll) {
    throw new Error(`bolts lost crossing: ${boltsAfterToll} -> ${ctx.bolts()}`);
  }
  if (count('salvage') !== packSalvage) {
    throw new Error(`pack lost crossing: salvage ${packSalvage} -> ${count('salvage')}`);
  }
  const kinds = new Set<string>();
  st().mobs?.forEach((m) => kinds.add(m.kind));
  if (!kinds.has('junkhound')) throw new Error(`no junkhounds in the Tangle (${[...kinds]})`);
  console.log(`tangle join ✓ at the gate — mobs: ${[...kinds].join(', ')}; bolts ${ctx.bolts()}`);

  // ── 4. Die on purpose in the mob box → Scrapcache drops ─────────────────
  const bait = seatNear(tmap, 20, 20, 3);
  ctx.room.send('move', { x: bait.x, y: bait.y });
  const baitTimer = setInterval(() => ctx.room.send('move', { x: bait.x, y: bait.y }), 4000);
  let cacheId = '';
  let cacheTile = { x: 0, y: 0 };
  const findCache = () => {
    cacheId = '';
    st().caches?.forEach((c, id) => {
      cacheId = id;
      cacheTile = { x: c.tileX, y: c.tileY };
    });
    return cacheId !== '';
  };
  await until(findCache, 'scrapcache drop', 240000);
  clearInterval(baitTimer);
  if (ctx.bolts() !== 0) throw new Error(`bolts should drop into the cache (${ctx.bolts()})`);
  if (count('salvage') !== 0) throw new Error('resources should drop into the cache');
  if (ctx.hotbar().filter((s) => s !== null).length !== hotbarBefore) {
    throw new Error('hotbar gear must NEVER drop');
  }
  console.log(`downed ✓ — cache ${cacheId} at ${cacheTile.x},${cacheTile.y}; gear kept, pockets empty`);

  // ── 5. Reclaim (loop: a post-reclaim death re-drops; reclaim that too) ──
  let feesPaid = 0;
  for (let attempt = 0; attempt < 4 && findCache(); attempt++) {
    const seat = seatNear(tmap, cacheTile.x, cacheTile.y, 2);
    await moveTo(seat.x, seat.y);
    const idNow = cacheId;
    ctx.room.send('reclaim', { cacheId: idNow });
    const t0 = Date.now();
    while (Date.now() - t0 < 15000) {
      let stillThere = false;
      st().caches?.forEach((_c, id) => {
        if (id === idNow) stillThere = true;
      });
      if (!stillThere) break;
      if (Date.now() - t0 > 12000) throw new Error('reclaim did not land');
      await sleep(120);
    }
    feesPaid += Math.min(fee, boltsAfterToll - feesPaid);
    await sleep(400); // let a possible immediate re-death register
  }
  const expected = boltsAfterToll - feesPaid;
  if (ctx.bolts() !== expected) {
    throw new Error(`reclaim bolts: expected ${expected}, got ${ctx.bolts()}`);
  }
  if (count('salvage') !== packSalvage) throw new Error('reclaim must return the resources');
  console.log(`reclaim ✓ — ${expected} B back (fees ${feesPaid}), salvage x${packSalvage}`);

  // ── 6. Tram home ────────────────────────────────────────────────────────
  const tgate = tmap.props.find((p) => p.kind === 'tramgate')!;
  const home = seatNear(tmap, tgate.x + 2, tgate.y + 2, 4);
  await moveTo(home.x, home.y);
  travelTo = '';
  ctx.room.onMessage('travelGo', (m: { to: string }) => (travelTo = m.to));
  ctx.room.send('travel', { to: 'filament' });
  await until(() => travelTo === 'filament', 'travelGo home', 10000);
  await ctx.room.leave();
  ctx = await joinDistrict(reg.token, 'filament');
  st = () => stateOf(ctx.room);
  me = () => st().players?.get?.(ctx.room.sessionId);
  await until(() => me() !== undefined && ctx.bolts() >= 0, 'filament rejoin');
  console.log(`home ✓ — bolts ${ctx.bolts()} after both tolls (${expected - toll} expected)`);
  if (ctx.bolts() !== expected - toll) throw new Error('homeward toll mismatch');

  console.log('TRAVEL PROBE PASSED');
  await ctx.room.leave();
  process.exit(0);
}

main().catch((err) => {
  console.error('PROBE FAILED:', err);
  process.exit(1);
});

/**
 * Crafting e2e: gather salvage + brass, sell for Bolts, craft a
 * Sparkwrench at the Tinkerbench (born at full durability), swing it
 * (tier damage, durability wears), then mend it back to full.
 */
import { Client } from 'colyseus.js';
import { CONFIG } from '@shared/config';
import { buildWorldMap } from '@shared/map';

const HTTP = 'http://localhost:2567';

interface Slot {
  itemId: string;
  qty: number;
  durability?: number;
}

async function main(): Promise<void> {
  const reg = await fetch(`${HTTP}/auth/guest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  }).then((r) => r.json() as Promise<{ token: string }>);
  const room = await new Client(HTTP).joinOrCreate('filament', { token: reg.token });

  let bolts = -1;
  let pack: Array<Slot | null> = [];
  let hotbar: Array<Slot | null> = [];
  let lastHitDamage = 0;
  room.onMessage(
    'inventory',
    (m: { pack: Array<Slot | null>; hotbar: Array<Slot | null>; bolts: number }) => {
      bolts = m.bolts;
      pack = m.pack;
      hotbar = m.hotbar;
    },
  );
  room.onMessage(
    'combat',
    (m: { type: string; bySessionId?: string; damage?: number }) => {
      if (m.type === 'playerHit' && m.bySessionId === room.sessionId) {
        lastHitDamage = m.damage ?? 0;
      }
    },
  );
  room.onMessage('*', () => undefined);

  const count = (id: string) =>
    pack.reduce((a, s) => (s?.itemId === id ? a + s.qty : a), 0);
  const st = () =>
    room.state as unknown as {
      players?: { get(id: string): { tileX: number; tileY: number; hp: number } | undefined };
      mobs?: { forEach(cb: (v: { tileX: number; tileY: number }, k: string) => void): void };
    };
  const me = () => st().players?.get?.(room.sessionId);
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const until = async (pred: () => boolean, label: string, timeoutMs = 180000) => {
    const t0 = Date.now();
    while (!pred()) {
      if (Date.now() - t0 > timeoutMs) throw new Error(`timeout: ${label}`);
      await sleep(60);
    }
  };
  const moveTo = async (x: number, y: number) => {
    room.send('move', { x, y });
    await until(() => me()?.tileX === x && me()?.tileY === y, `arrive ${x},${y}`);
  };
  const map = buildWorldMap();
  const adjOf = (x: number, y: number) => {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      if (map.walkable[y + dy]?.[x + dx] === true) return { x: x + dx, y: y + dy };
    }
    return null;
  };
  const seatNear = (x: number, y: number, r = 3) => {
    for (let rad = 1; rad <= r; rad++) {
      for (let dy = -rad; dy <= rad; dy++) {
        for (let dx = -rad; dx <= rad; dx++) {
          if (map.walkable[y + dy]?.[x + dx] === true) return { x: x + dx, y: y + dy };
        }
      }
    }
    return null;
  };
  const nodesDepleted = () =>
    room.state as unknown as { nodes?: { get(id: string): { depleted: boolean } | undefined } };
  const gatherAt = async (
    kind: string,
    item: string,
    target: number,
    near: { x: number; y: number },
  ) => {
    // Rotate across the nearest nodes of this kind — each gather depletes
    // its node for a respawn window, so single-node farming stalls.
    const ranked = map.nodes
      .filter((n) => n.kind === kind && adjOf(n.x, n.y) !== null)
      .map((n) => ({ ...n, d: Math.abs(n.x - near.x) + Math.abs(n.y - near.y) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 6);
    if (ranked.length === 0) throw new Error(`no reachable ${kind}`);
    const timer = setInterval(() => {
      if (count(item) >= target) return;
      const live = ranked.find(
        (n) => nodesDepleted().nodes?.get(String(n.id))?.depleted === false,
      );
      if (live !== undefined) room.send('gather', { nodeId: live.id });
    }, 1400);
    await until(() => count(item) >= target, `${item} x${target}`, 300000);
    clearInterval(timer);
  };

  await until(() => me() !== undefined && bolts >= 0, 'joined');
  console.log('joined');

  // Salvage (magclaw, slot 0) — enough to sell for 30+ Bolts and keep 12.
  room.send('selectSlot', { slot: 0 });
  await sleep(150);
  await gatherAt('junkHeap', 'salvage', 26, { x: 30, y: 20 });
  const clawDur = hotbar[0]?.durability ?? -1;
  console.log('salvage 26; magclaw durability now', clawDur);
  if (clawDur >= (CONFIG.gear.maxDurability[1] as number)) {
    throw new Error('gathering did not wear the magclaw');
  }

  // Brass ×4 (drillhammer, slot 1) — the yard has teeth; expect bites.
  room.send('selectSlot', { slot: 1 });
  await sleep(150);
  await gatherAt('brassSeam', 'brass', 4, { x: 32, y: 30 });
  console.log('brass 4');

  // Sell 14 salvage at the stand for Bolts.
  const stand = map.props.find((p) => p.kind === 'merchant');
  const seat = seatNear(stand!.x, stand!.y)!;
  await moveTo(seat.x, seat.y);
  room.send('trade', { action: 'sellResource', itemId: 'salvage', qty: 14 });
  await until(() => bolts >= 30, 'bolts >= 30', 15000);
  console.log('bolts:', bolts);

  // Craft the Sparkwrench at the bench.
  const bench = map.props.find((p) => p.kind === 'tinkerbench');
  const benchSeat = seatNear(bench!.x, bench!.y)!;
  await moveTo(benchSeat.x, benchSeat.y);
  room.send('craft', { recipeId: 'wrench1' });
  await until(() => pack.some((s) => s?.itemId === 'sparkwrench'), 'wrench crafted', 15000);
  const wrench = pack.find((s) => s?.itemId === 'sparkwrench') as Slot;
  console.log('crafted sparkwrench, durability', wrench.durability);
  if (wrench.durability !== CONFIG.gear.maxDurability[1]) throw new Error('not full durability');

  // Equip it: move to hotbar slot 5 (empty), select it, swing at a bot.
  const packIdx = pack.findIndex((s) => s?.itemId === 'sparkwrench');
  room.send('moveStack', { from: 'pack', fromIdx: packIdx, to: 'hotbar', toIdx: 5 });
  await until(() => hotbar[5]?.itemId === 'sparkwrench', 'equipped', 10000);
  room.send('selectSlot', { slot: 5 });
  await sleep(150);

  let firstMob: { tileX: number; tileY: number } | null = null;
  st().mobs?.forEach((v) => {
    if (firstMob === null) firstMob = v;
  });
  const fm = firstMob as unknown as { tileX: number; tileY: number };
  const mobSeat = seatNear(fm.tileX, fm.tileY, 2)!;
  await moveTo(mobSeat.x, mobSeat.y);
  const swing = setInterval(() => {
    let id: string | null = null;
    const p = me();
    (st().mobs as unknown as { forEach(cb: (v: { tileX: number; tileY: number }, k: string) => void): void }).forEach(
      (v, k) => {
        if (id !== null || !p) return;
        if (Math.max(Math.abs(v.tileX - p.tileX), Math.abs(v.tileY - p.tileY)) <= 1) id = k;
      },
    );
    if (id !== null) room.send('attack', { mobId: id });
  }, 800);
  await until(() => lastHitDamage > 0, 'wrench hit', 60000);
  clearInterval(swing);
  const expected = Math.round(
    CONFIG.combat.player.attackDamage * (CONFIG.gear.weaponDamageMult[1] as number),
  );
  console.log(`wrench hit for ${lastHitDamage} (expected ${expected})`);
  if (lastHitDamage !== expected) throw new Error('tier damage mismatch');
  await until(
    () => (hotbar[5]?.durability ?? 999) < (CONFIG.gear.maxDurability[1] as number),
    'wrench wore',
    10000,
  );

  // Mend the magclaw at the bench.
  await moveTo(benchSeat.x, benchSeat.y);
  const before = hotbar[0]?.durability ?? 0;
  room.send('repair', { source: 'hotbar', slot: 0 });
  await until(
    () => (hotbar[0]?.durability ?? 0) === CONFIG.gear.maxDurability[1],
    'magclaw mended',
    15000,
  );
  console.log(`magclaw mended ${before} -> ${hotbar[0]?.durability}; bolts left ${bolts}`);

  console.log('CRAFT PROBE PASSED');
  await room.leave();
  process.exit(0);
}

main().catch((err) => {
  console.error('PROBE FAILED:', err);
  process.exit(1);
});

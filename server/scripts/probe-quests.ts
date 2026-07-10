/**
 * Quest-chain e2e: run the whole tutorial at the Dispatcher —
 * tut1 gather 10 Salvage → tut2 sell 10 → tut3 craft → tut4 two more
 * skills (Delving via brass, Tuning via the antenna) → tut5 donate 5
 * Amperite at the Warden → the Dispatch Scarf lands on the Spark.
 */
import { Client } from 'colyseus.js';
import { buildWorldMap } from '@shared/map';

const HTTP = 'http://localhost:2567';

interface Slot {
  itemId: string;
  qty: number;
}
interface QuestSt {
  state: string;
  progress: number;
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
  let quests: Record<string, QuestSt> = {};
  room.onMessage(
    'inventory',
    (m: { pack: Array<Slot | null>; bolts: number }) => {
      bolts = m.bolts;
      pack = m.pack;
    },
  );
  room.onMessage('quests', (m: { log: Record<string, QuestSt> }) => (quests = m.log));
  room.onMessage('*', () => undefined);

  const count = (id: string) => pack.reduce((a, s) => (s?.itemId === id ? a + s.qty : a), 0);
  const st = () =>
    room.state as unknown as {
      players?: {
        get(id: string): { tileX: number; tileY: number; cosmetic: string } | undefined;
      };
      nodes?: { get(id: string): { depleted: boolean } | undefined };
    };
  const me = () => st().players?.get?.(room.sessionId);
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const until = async (pred: () => boolean, label: string, timeoutMs = 240000) => {
    const t0 = Date.now();
    while (!pred()) {
      if (Date.now() - t0 > timeoutMs) throw new Error(`timeout: ${label}`);
      await sleep(70);
    }
  };
  const map = buildWorldMap();
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
  const moveTo = async (x: number, y: number) => {
    room.send('move', { x, y });
    await until(() => me()?.tileX === x && me()?.tileY === y, `arrive ${x},${y}`);
  };
  const propSeat = (kind: string) => {
    const prop = map.props.find((p) => p.kind === kind)!;
    return seatNear(prop.x, prop.y)!;
  };
  const gatherRotate = async (kind: string, item: string, target: number, slot: number) => {
    room.send('selectSlot', { slot });
    await sleep(150);
    const ranked = map.nodes
      .filter((n) => n.kind === kind)
      .map((n) => ({ ...n, d: Math.abs(n.x - 20) + Math.abs(n.y - 20) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 6);
    const timer = setInterval(() => {
      if (count(item) >= target) return;
      const live = ranked.find((n) => st().nodes?.get(String(n.id))?.depleted === false);
      if (live !== undefined) room.send('gather', { nodeId: live.id });
    }, 1400);
    await until(() => count(item) >= target, `${item} x${target}`, 360000);
    clearInterval(timer);
  };

  await until(() => me() !== undefined && bolts >= 0, 'joined');
  const dispatcherSeat = propSeat('dispatcher');
  const q = (id: string) => quests[id];

  // Accept tut1 at the board, gather, turn in.
  await moveTo(dispatcherSeat.x, dispatcherSeat.y);
  room.send('quest', { action: 'accept', id: 'tut1' });
  await until(() => q('tut1')?.state === 'active', 'tut1 active', 10000);
  await gatherRotate('junkHeap', 'salvage', 24, 0);
  await moveTo(dispatcherSeat.x, dispatcherSeat.y);
  await until(() => (q('tut1')?.progress ?? 0) >= 10, 'tut1 progress', 10000);
  const b0 = bolts;
  room.send('quest', { action: 'turnIn', id: 'tut1' });
  await until(() => q('tut1')?.state === 'turnedIn' && bolts === b0 + 25, 'tut1 reward', 10000);
  console.log('tut1 ✓ (+25 B)');

  // tut2: sell 10 at the stand.
  room.send('quest', { action: 'accept', id: 'tut2' });
  await until(() => q('tut2')?.state === 'active', 'tut2 active', 10000);
  const standSeat = propSeat('merchant');
  await moveTo(standSeat.x, standSeat.y);
  room.send('trade', { action: 'sellResource', itemId: 'salvage', qty: 12 });
  await until(() => (q('tut2')?.progress ?? 0) >= 10, 'tut2 progress', 15000);
  await moveTo(dispatcherSeat.x, dispatcherSeat.y);
  room.send('quest', { action: 'turnIn', id: 'tut2' });
  await until(() => q('tut2')?.state === 'turnedIn', 'tut2 done', 10000);
  console.log('tut2 ✓');

  // tut3: craft a wrench (needs brass 4).
  room.send('quest', { action: 'accept', id: 'tut3' });
  await until(() => q('tut3')?.state === 'active', 'tut3 active', 10000);
  await gatherRotate('brassSeam', 'brass', 4, 1);
  const benchSeat = propSeat('tinkerbench');
  await moveTo(benchSeat.x, benchSeat.y);
  room.send('craft', { recipeId: 'wrench1' });
  await until(() => (q('tut3')?.progress ?? 0) >= 1, 'tut3 progress', 15000);
  await moveTo(dispatcherSeat.x, dispatcherSeat.y);
  room.send('quest', { action: 'turnIn', id: 'tut3' });
  await until(() => q('tut3')?.state === 'turnedIn', 'tut3 done', 10000);
  console.log('tut3 ✓');

  // tut4 (accepted only now — prereq satisfied): the skills must land while
  // it's ACTIVE, so gather one more brass (Delving), then tune (Tuning).
  room.send('quest', { action: 'accept', id: 'tut4' });
  await until(() => q('tut4')?.state === 'active', 'tut4 active', 10000);
  const brassNow = count('brass');
  await gatherRotate('brassSeam', 'brass', brassNow + 1, 1);
  await until(() => (q('tut4')?.progress ?? 0) >= 1, 'tut4 delving counted', 20000);
  const antenna = map.nodes.find((n) => n.kind === 'antenna')!;
  room.send('selectSlot', { slot: 3 });
  await sleep(150);
  const retune = setInterval(() => {
    if ((q('tut4')?.progress ?? 0) < 2) room.send('gather', { nodeId: antenna.id });
  }, 2500);
  const needleTimer = setInterval(
    () => room.send('nodeAction', { nodeId: antenna.id, action: 'tune', needle: 0.5 }),
    300,
  );
  await until(() => (q('tut4')?.progress ?? 0) >= 2, 'tut4 progress', 120000);
  clearInterval(needleTimer);
  clearInterval(retune);
  await moveTo(dispatcherSeat.x, dispatcherSeat.y);
  room.send('quest', { action: 'turnIn', id: 'tut4' });
  await until(() => q('tut4')?.state === 'turnedIn', 'tut4 done', 10000);
  console.log('tut4 ✓');

  // tut5: donate 5 Amperite at the Warden → the scarf lands.
  room.send('quest', { action: 'accept', id: 'tut5' });
  await until(() => q('tut5')?.state === 'active', 'tut5 active', 10000);
  // Amperite is the strike-timing layer: keep swinging while gathering
  // (off-pulse still chips 1 per strike — the bot doesn't chase the glow).
  const ranked = map.nodes
    .filter((n) => n.kind === 'amperite')
    .map((n) => ({ ...n, d: Math.abs(n.x - 20) + Math.abs(n.y - 20) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 5);
  room.send('selectSlot', { slot: 1 });
  await sleep(150);
  const gatherT = setInterval(() => {
    if (count('amperite') >= 5) return;
    const live = ranked.find((n) => st().nodes?.get(String(n.id))?.depleted === false);
    if (live !== undefined) room.send('gather', { nodeId: live.id });
  }, 1600);
  const strikeT = setInterval(() => {
    if (count('amperite') >= 5) return;
    for (const n of ranked) room.send('nodeAction', { nodeId: n.id, action: 'strike' });
  }, 700);
  await until(() => count('amperite') >= 5, 'amperite x5', 360000);
  clearInterval(gatherT);
  clearInterval(strikeT);
  const wardenSeat = propSeat('warden');
  await moveTo(wardenSeat.x, wardenSeat.y);
  room.send('donate', { itemId: 'amperite', qty: 5 });
  await until(() => (q('tut5')?.progress ?? 0) >= 5, 'tut5 progress', 15000);
  await moveTo(dispatcherSeat.x, dispatcherSeat.y);
  room.send('quest', { action: 'turnIn', id: 'tut5' });
  await until(
    () => q('tut5')?.state === 'turnedIn' && me()?.cosmetic === 'starterScarf',
    'scarf awarded',
    10000,
  );
  console.log(`tut5 ✓ — scarf worn (${me()?.cosmetic}); bolts ${bolts}`);

  console.log('QUEST PROBE PASSED');
  await room.leave();
  process.exit(0);
}

main().catch((err) => {
  console.error('PROBE FAILED:', err);
  process.exit(1);
});

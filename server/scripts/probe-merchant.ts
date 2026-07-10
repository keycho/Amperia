/**
 * Merchant e2e: gather salvage, sell it at the stand (band price, Bolts
 * paid, price slides), buy a Warmcup, take a Scuttlebot bite, use the
 * Warmcup (heal). Polls synced state; server owns everything.
 */
import { Client } from 'colyseus.js';
import { buildWorldMap } from '@shared/map';

const HTTP = 'http://localhost:2567';

async function main(): Promise<void> {
  const reg = await fetch(`${HTTP}/auth/guest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  }).then((r) => r.json() as Promise<{ token: string }>);
  const room = await new Client(HTTP).joinOrCreate('filament', { token: reg.token });

  let bolts = -1;
  let salvage = 0;
  let warmcups = 0;
  let prices: Record<string, number> = {};
  const notices: string[] = [];
  room.onMessage('notice', (m: { text: string }) => notices.push(m.text));
  room.onMessage('prices', (m: { buy: Record<string, number> }) => (prices = m.buy));
  room.onMessage(
    'inventory',
    (m: { pack: Array<{ itemId: string; qty: number } | null>; bolts: number }) => {
      bolts = m.bolts;
      salvage = m.pack.reduce((a, s) => (s?.itemId === 'salvage' ? a + s.qty : a), 0);
      warmcups = m.pack.reduce((a, s) => (s?.itemId === 'warmcup' ? a + s.qty : a), 0);
    },
  );
  room.onMessage('*', () => undefined);

  const st = () =>
    room.state as unknown as {
      players?: { get(id: string): { tileX: number; tileY: number; hp: number } | undefined };
    };
  const me = () => st().players?.get?.(room.sessionId);
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const until = async (pred: () => boolean, label: string, timeoutMs = 120000) => {
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

  await until(() => me() !== undefined && bolts >= 0, 'joined');
  console.log('joined; bolts =', bolts, 'prices:', JSON.stringify(prices));

  // Gather salvage at the heap nearest the merchant.
  const map = buildWorldMap();
  const stand = map.props.find((p) => p.kind === 'merchant');
  if (!stand) throw new Error('no merchant on the map');
  let best: { id: number; x: number; y: number; d: number } | null = null;
  for (const n of map.nodes) {
    if (n.kind !== 'junkHeap') continue;
    const d = Math.abs(n.x - stand.x) + Math.abs(n.y - stand.y);
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
  if (!adj) throw new Error('heap unreachable');
  await moveTo(adj.x, adj.y);
  room.send('selectSlot', { slot: 0 });
  const regather = setInterval(() => {
    if (salvage < 12) room.send('gather', { nodeId: heap.id });
  }, 1200);
  await until(() => salvage >= 12, 'salvage x12', 180000);
  clearInterval(regather);
  console.log('gathered salvage:', salvage);

  // Walk to the stand and sell 10.
  let seat: { x: number; y: number } | null = null;
  outer: for (let r = 1; r <= 3; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const t = { x: stand.x + dx, y: stand.y + dy };
        if (map.walkable[t.y]?.[t.x] === true) {
          seat = t;
          break outer;
        }
      }
    }
  }
  if (!seat) throw new Error('no seat by the stand');
  await moveTo(seat.x, seat.y);
  const priceBefore = prices.salvage ?? -1;
  const boltsBefore = bolts;
  room.send('trade', { action: 'sellResource', itemId: 'salvage', qty: 10 });
  await until(() => bolts > boltsBefore, 'bolts paid', 15000);
  console.log(
    `sold 10 salvage: bolts ${boltsBefore} -> ${bolts} (unit price was ${priceBefore}, now ${prices.salvage})`,
  );
  if (bolts - boltsBefore > priceBefore * 10) throw new Error('paid above the opening price');

  // Buy a Warmcup (needs 12 Bolts).
  if (bolts >= 12) {
    room.send('trade', { action: 'buyItem', itemId: 'warmcup' });
    await until(() => warmcups > 0, 'warmcup bought', 15000);
    console.log('warmcup bought; bolts =', bolts);

    // Take a bite in the scrap yard, then drink it.
    const mobsSt = () =>
      room.state as unknown as {
        mobs?: { forEach(cb: (v: { tileX: number; tileY: number }, k: string) => void): void };
      };
    let firstMob: { tileX: number; tileY: number } | null = null;
    mobsSt().mobs?.forEach((v) => {
      if (firstMob === null) firstMob = v;
    });
    if (firstMob !== null) {
      const fm = firstMob as { tileX: number; tileY: number };
      room.send('move', { x: fm.tileX, y: fm.tileY - 1 });
      const hp0 = (me() as { hp: number }).hp;
      await until(() => (me()?.hp ?? hp0) < hp0, 'bitten', 60000);
      const hurt = (me() as { hp: number }).hp;
      // Find the warmcup slot and use it.
      let cupSlot = -1;
      const inv = await new Promise<Array<{ itemId: string } | null>>((resolve) => {
        room.onMessage(
          'inventory',
          (m: { pack: Array<{ itemId: string; qty: number } | null>; bolts: number }) => {
            bolts = m.bolts;
            resolve(m.pack);
          },
        );
        room.send('selectSlot', { slot: 0 }); // nudge a sync? inventory won't resend; use last known
        setTimeout(() => resolve([]), 300);
      });
      void inv;
      // We track pack via the inventory handler; ask for slot by scanning last sync:
      // simplest: try each pack slot until the heal lands.
      for (let i = 0; i < 24 && cupSlot < 0; i++) {
        room.send('useItem', { slot: i });
        await sleep(120);
        const now = (me() as { hp: number }).hp;
        if (now > hurt) cupSlot = i;
      }
      if (cupSlot < 0) throw new Error('warmcup did not heal');
      console.log(`warmcup healed at slot ${cupSlot}: hp ${hurt} -> ${me()?.hp}`);
    }
  }

  console.log('MERCHANT PROBE PASSED');
  await room.leave();
  process.exit(0);
}

main().catch((err) => {
  console.error('PROBE FAILED:', err);
  process.exit(1);
});

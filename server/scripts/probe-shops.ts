/**
 * Player-shop e2e (E2): rent a stall, stock it, then prove the counter
 * sells while the owner is OFFLINE — proceeds escrow in the cashbox, the
 * owner gets the away-sales toast on login and collects; finally rent
 * expiry vacates the stall (first-come re-rent) and mails the old stock
 * back to the ex-owner. Run against a live server: npx tsx scripts/probe-shops.ts
 */
import { Client, type Room } from 'colyseus.js';
import { buildWorldMap } from '@shared/map';
import { CONFIG } from '@shared/config';
import { prisma } from '../src/services/db.js';

const HTTP = 'http://localhost:2567';

interface Probe {
  room: Room;
  token: string;
  name: string;
  bolts: number;
  counts: Map<string, number>;
  notices: string[];
  shopSyncs: Array<{
    stallId: number;
    ownerName: string;
    mine: boolean;
    rentPaidUntilMs: number | null;
    stock: Array<{ itemId: string; qty: number; priceBolts: number }>;
    cashboxBolts: number;
  }>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(pred: () => boolean, label: string, timeoutMs = 60000): Promise<void> {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > timeoutMs) throw new Error(`timeout: ${label}`);
    await sleep(50);
  }
}

async function register(): Promise<{ token: string; sparkName: string }> {
  return (await fetch(`${HTTP}/auth/guest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  }).then((r) => r.json())) as { token: string; sparkName: string };
}

async function joinRoom(token: string, name: string): Promise<Probe> {
  const room = await new Client(HTTP).joinOrCreate('filament', { token });
  const p: Probe = {
    room,
    token,
    name,
    bolts: -1,
    counts: new Map(),
    notices: [],
    shopSyncs: [],
  };
  room.onMessage(
    'inventory',
    (m: { pack: Array<{ itemId: string; qty: number } | null>; bolts: number }) => {
      p.bolts = m.bolts;
      p.counts = new Map();
      for (const s of m.pack) {
        if (s !== null) p.counts.set(s.itemId, (p.counts.get(s.itemId) ?? 0) + s.qty);
      }
    },
  );
  room.onMessage('notice', (m: { text: string }) => p.notices.push(m.text));
  room.onMessage('shopSync', (m: Probe['shopSyncs'][0]) => p.shopSyncs.push(m));
  room.onMessage('*', () => undefined);
  await until(() => p.bolts >= 0, `${name} joined`);
  return p;
}

const salvage = (p: Probe) => p.counts.get('salvage') ?? 0;
const lastShop = (p: Probe) => p.shopSyncs[p.shopSyncs.length - 1];

function me(p: Probe): { tileX: number; tileY: number; gathering?: boolean } | undefined {
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
    if ((me(p) as { gathering?: boolean } | undefined)?.gathering === true) return;
    const free = heaps.find((h) => st().nodes?.get(String(h.id))?.depleted !== true);
    if (free !== undefined) p.room.send('gather', { nodeId: free.id });
  }, 900);
  await until(() => salvage(p) >= want, `salvage x${want}`, 180000);
  clearInterval(timer);
}

async function setBolts(sparkName: string, bolts: number): Promise<void> {
  await prisma.character.update({ where: { sparkName }, data: { bolts } });
}

/** A walkable lane tile in front of the stall's counter. */
function standAt(stall: { x: number; y: number }): { x: number; y: number } {
  return { x: stall.x, y: stall.y === 17 ? 19 : 21 };
}

async function main(): Promise<void> {
  const map = buildWorldMap();
  const stall = map.shopStalls[0];
  if (stall === undefined) throw new Error('no shop stalls on the map');
  const seat = standAt(stall);
  const rent = CONFIG.economy.shops.rentBoltsPerWeek;

  // Owner account, funded before first room join (DB row exists post-register).
  const regA = await register();
  await setBolts(regA.sparkName, 1000);
  let a = await joinRoom(regA.token, regA.sparkName);
  console.log(`A = ${a.name} (${a.bolts} Bolts)`);

  console.log('\n— rent a vacant stall —');
  await moveTo(a, seat.x, seat.y);
  a.room.send('shop', { action: 'browse', stallId: stall.id });
  await until(() => lastShop(a) !== undefined, 'browse answered');
  if (lastShop(a)?.ownerName !== '') throw new Error('stall 0 not vacant');
  const boltsBeforeRent = a.bolts;
  a.room.send('shop', { action: 'rent', stallId: stall.id });
  await until(() => lastShop(a)?.mine === true, 'stall rented');
  if (a.bolts !== boltsBeforeRent - rent) throw new Error('rent not charged');
  console.log(`rented stall ${stall.id} for ${rent} Bolts ✓`);

  console.log('\n— stock the counter —');
  await gatherSalvage(a, 6);
  await moveTo(a, seat.x, seat.y);
  a.room.send('shop', { action: 'stock', stallId: stall.id, slot: 0, qty: 5, priceBolts: 4 });
  await until(
    () => lastShop(a)?.stock.some((l) => l.itemId === 'salvage' && l.qty === 5) === true,
    'stock listed',
  );
  console.log('5 salvage on the counter at 4 Bolts each ✓');

  console.log('\n— owner goes OFFLINE; a buyer shops the stall —');
  await a.room.leave();
  await sleep(800);

  const regB = await register();
  await setBolts(regB.sparkName, 400); // enough to buy AND re-rent later
  const b = await joinRoom(regB.token, regB.sparkName);
  console.log(`B = ${b.name} (${b.bolts} Bolts)`);
  await moveTo(b, seat.x, seat.y);
  b.room.send('shop', { action: 'browse', stallId: stall.id });
  await until(() => lastShop(b)?.stock.length === 1, 'B sees the goods');
  if (lastShop(b)?.mine !== false) throw new Error('B thinks it owns the stall');
  const bBolts = b.bolts;
  b.room.send('shop', { action: 'buy', stallId: stall.id, lineIdx: 0, qty: 3 });
  await until(() => salvage(b) === 3, 'B holds the goods');
  const gross = 4 * 3;
  const fee = Math.ceil(gross * CONFIG.economy.shops.saleFeeFraction);
  if (b.bolts !== bBolts - gross) throw new Error(`B paid ${bBolts - b.bolts}, expected ${gross}`);
  console.log(`B bought 3 salvage for ${gross} Bolts while the owner was offline ✓`);

  console.log('\n— owner returns: away-sales toast + collect —');
  a = await joinRoom(regA.token, regA.sparkName);
  await until(
    () => a.notices.some((t) => t.includes('Sold while you were away')),
    'away-sales toast',
  );
  console.log(`toast: "${a.notices.find((t) => t.includes('Sold while'))}"`);
  await moveTo(a, seat.x, seat.y);
  const beforeCollect = a.bolts;
  a.room.send('shop', { action: 'collect', stallId: stall.id });
  await until(() => a.bolts === beforeCollect + (gross - fee), 'cashbox collected');
  console.log(`collected ${gross - fee} Bolts (fee ${fee} destroyed) ✓`);

  console.log('\n— rent expiry: the stall frees up, goods mail home —');
  const aSalvageBefore = salvage(a);
  await a.room.leave();
  await sleep(800);
  await prisma.shopStall.update({
    where: { id: stall.id },
    data: { rentPaidUntil: new Date(Date.now() - 1000) },
  });
  // Any access lazily vacates a lapsed stall — B browses, then re-rents.
  b.room.send('shop', { action: 'browse', stallId: stall.id });
  await until(
    () => lastShop(b)?.ownerName === '' && lastShop(b)?.stock.length === 0,
    'stall vacated on access',
  );
  b.room.send('shop', { action: 'rent', stallId: stall.id });
  await until(() => lastShop(b)?.mine === true, 'B re-rented the pitch (first-come)');
  console.log('lapsed stall vacated and re-rented by the next Spark ✓');

  a = await joinRoom(regA.token, regA.sparkName);
  await until(
    () => a.notices.some((t) => t.includes('rent ran out')),
    'return-mail toast',
  );
  await until(() => salvage(a) === aSalvageBefore + 2, 'leftover stock mailed back');
  console.log('ex-owner got the 2 unsold salvage back on login ✓');

  console.log('\nSHOPS PROBE PASSED');
  await a.room.leave();
  await b.room.leave();
  process.exit(0);
}

main().catch((err) => {
  console.error('PROBE FAILED:', err);
  process.exit(1);
});

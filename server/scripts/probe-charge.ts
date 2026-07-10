/**
 * Citywide Charge e2e (E3): donate Amperite at the Warden → the weekly
 * meter climbs (synced state + chargeSync detail + /charge command); moving
 * the contribution into LAST week proves the Monday-key reset reads zero;
 * the 60s sweep finalizes the past week into a top-contributor award that
 * delivers the name-glow trim on next login.
 * Run against a live server: npx tsx scripts/probe-charge.ts
 */
import { Client, type Room } from 'colyseus.js';
import { chargeWeekKey } from '@shared/charge';
import { prisma } from '../src/services/db.js';

const HTTP = 'http://localhost:2567';

interface Probe {
  room: Room;
  name: string;
  amperite: number;
  joined: boolean;
  notices: string[];
  chargeSyncs: Array<{ weekKey: string; total: number; tier: number; top: Array<{ sparkName: string }> }>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(pred: () => boolean, label: string, timeoutMs = 60000): Promise<void> {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > timeoutMs) throw new Error(`timeout: ${label}`);
    await sleep(60);
  }
}

async function joinRoom(token: string, name: string): Promise<Probe> {
  const room = await new Client(HTTP).joinOrCreate('filament', { token });
  const p: Probe = { room, name, amperite: 0, joined: false, notices: [], chargeSyncs: [] };
  room.onMessage(
    'inventory',
    (m: { pack: Array<{ itemId: string; qty: number } | null> }) => {
      p.joined = true;
      p.amperite = m.pack.reduce((a, s) => (s?.itemId === 'amperite' ? a + s.qty : a), 0);
    },
  );
  room.onMessage('notice', (m: { text: string }) => p.notices.push(m.text));
  room.onMessage('chargeSync', (m: Probe['chargeSyncs'][0]) => p.chargeSyncs.push(m));
  room.onMessage('*', () => undefined);
  await until(() => p.joined, `${name} joined`);
  return p;
}

function me(p: Probe): { tileX: number; tileY: number; trim?: string } | undefined {
  const st = p.room.state as unknown as {
    players?: { get(id: string): { tileX: number; tileY: number; trim?: string } | undefined };
  };
  return st.players?.get?.(p.room.sessionId);
}

async function moveTo(p: Probe, x: number, y: number): Promise<void> {
  p.room.send('move', { x, y });
  await until(() => me(p)?.tileX === x && me(p)?.tileY === y, `arrive ${x},${y}`);
}

async function main(): Promise<void> {
  const reg = (await fetch(`${HTTP}/auth/guest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  }).then((r) => r.json())) as { token: string; sparkName: string };
  // Fund the pack before the first room join (the row exists post-register).
  await prisma.character.update({
    where: { sparkName: reg.sparkName },
    data: { packJson: [{ itemId: 'amperite', qty: 60 }] },
  });
  let a = await joinRoom(reg.token, reg.sparkName);
  const character = await prisma.character.findUniqueOrThrow({
    where: { sparkName: reg.sparkName },
  });
  console.log(`A = ${a.name} holding ${a.amperite} Amperite`);

  console.log('\n— donate at the Warden: the meter climbs —');
  await moveTo(a, 24, 21); // beside the Charge Warden at the Dynamo
  const weekNow = chargeWeekKey(Date.now());
  a.room.send('donate', { itemId: 'amperite', qty: 20 });
  await until(() => a.amperite === 40, 'amperite left the pack');
  await until(
    () => a.notices.some((t) => t.includes('Citywide Charge stands at')),
    'meter notice',
  );
  a.room.send('chargeInfo', {});
  await until(
    () => a.chargeSyncs.some((s) => s.weekKey === weekNow && s.total >= 20),
    'chargeSync shows the donation',
  );
  const syncNow = a.chargeSyncs[a.chargeSyncs.length - 1];
  console.log(`meter: ${syncNow?.total} Amperite (week ${syncNow?.weekKey}) ✓`);
  if (syncNow?.top.some((t) => t.sparkName === a.name) !== true) {
    throw new Error('donor missing from the leaderboard');
  }
  console.log('donor on the leaderboard ✓');

  console.log('\n— /charge command —');
  a.room.send('chat', { text: '/charge' });
  await until(
    () => a.notices.some((t) => t.startsWith('Citywide Charge (week of')),
    '/charge reply',
  );
  console.log(a.notices.find((t) => t.startsWith('Citywide Charge (week of')));

  console.log('\n— Monday reset: last week\'s meter reads zero this week —');
  const lastWeek = chargeWeekKey(Date.now() - 7 * 86_400_000);
  // Test hygiene: a week finalizes exactly once (idempotent awards), so a
  // re-run must clear its test week before staging contributions there.
  await prisma.chargeAward.deleteMany({ where: { weekKey: lastWeek } });
  await prisma.chargeContribution.deleteMany({ where: { weekKey: lastWeek } });
  await prisma.chargeContribution.updateMany({
    where: { weekKey: weekNow, accountId: character.accountId },
    data: { weekKey: lastWeek },
  });
  // The meter caches ~30s server-side; keep asking until the fresh read.
  const resetSeen = () => {
    const last = a.chargeSyncs[a.chargeSyncs.length - 1];
    return last !== undefined && last.weekKey === weekNow && last.total === 0;
  };
  {
    const t0 = Date.now();
    while (!resetSeen()) {
      if (Date.now() - t0 > 60_000) throw new Error('timeout: meter reset to 0');
      a.room.send('chargeInfo', {});
      await sleep(2500);
    }
  }
  console.log('meter reads 0 after the key rolls ✓');

  console.log('\n— past week finalizes → name-glow trim on next login —');
  // The 60s room sweep runs finalizePastWeeks; wait for the award row.
  await until(
    () => true,
    'noop',
  );
  const awardAppeared = async () =>
    (await prisma.chargeAward.count({
      where: { accountId: character.accountId, weekKey: lastWeek },
    })) > 0;
  {
    const t0 = Date.now();
    while (!(await awardAppeared())) {
      if (Date.now() - t0 > 90_000) throw new Error('timeout: award finalized');
      await sleep(2000);
    }
  }
  console.log('top-contributor award finalized by the sweep ✓');
  await a.room.leave();
  await sleep(800);
  a = await joinRoom(reg.token, reg.sparkName);
  await until(
    () => a.notices.some((t) => t.includes('your name carries the glow')),
    'award toast on login',
  );
  await until(() => me(a)?.trim === 'chargeTrim', 'trim synced on the Spark');
  const award = await prisma.chargeAward.findFirstOrThrow({
    where: { accountId: character.accountId, weekKey: lastWeek },
  });
  if (award.deliveredAt === null) throw new Error('award not marked delivered');
  console.log('trim delivered, worn, and marked ✓');

  console.log('\nCHARGE PROBE PASSED');
  await a.room.leave();
  process.exit(0);
}

main().catch((err) => {
  console.error('PROBE FAILED:', err);
  process.exit(1);
});

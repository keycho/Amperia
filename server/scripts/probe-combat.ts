/**
 * Combat e2e probe (node-side, real time — no headless throttling):
 * walk into the scrap corner, get aggroed and bitten, swing back, kill a
 * bot (Brawling XP), get knocked flat (respawn at the Dynamo, full heal,
 * no item loss), then confirm the Heatlamp cost gate. Polls synced state
 * directly — no callback registration races.
 */
import { Client } from 'colyseus.js';

const HTTP = 'http://localhost:2567';

interface MobShape {
  tileX: number;
  tileY: number;
  hp: number;
  maxHp: number;
  ai: string;
}

async function main(): Promise<void> {
  const reg = await fetch(`${HTTP}/auth/guest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  }).then((r) => r.json() as Promise<{ token: string }>);

  const client = new Client(HTTP);
  const room = await client.joinOrCreate('filament', { token: reg.token });

  let brawlXp = 0;
  let downs = 0;
  const notices: string[] = [];
  room.onMessage('xpGain', (m: { skill: string; amount: number }) => {
    if (m.skill === 'brawling') brawlXp += m.amount;
  });
  room.onMessage('notice', (m: { text: string }) => notices.push(m.text));
  room.onMessage('combat', (m: { type: string; sessionId?: string }) => {
    if (m.type === 'playerDown' && m.sessionId === room.sessionId) downs++;
  });
  room.onMessage('*', () => undefined);

  const state = () =>
    room.state as unknown as {
      mobs?: { forEach(cb: (v: MobShape, k: string) => void): void };
      players?: { get(id: string): { tileX: number; tileY: number; hp: number } | undefined };
    };
  const mobs = (): Map<string, MobShape> => {
    const out = new Map<string, MobShape>();
    state().mobs?.forEach((v, k) =>
      out.set(k, { tileX: v.tileX, tileY: v.tileY, hp: v.hp, maxHp: v.maxHp, ai: v.ai }),
    );
    return out;
  };
  const me = () => state().players?.get?.(room.sessionId);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const until = async (pred: () => boolean, label: string, timeoutMs = 60000) => {
    const t0 = Date.now();
    while (!pred()) {
      if (Date.now() - t0 > timeoutMs) throw new Error(`timeout: ${label}`);
      await sleep(60);
    }
  };

  await until(() => me() !== undefined, 'joined');
  await until(() => mobs().size > 0, 'mobs synced', 15000);
  console.log(`joined; ${mobs().size} scuttlebots in the room`);

  // 1. Walk into the scrap corner next to the first bot.
  const firstId = [...mobs().keys()][0] as string;
  const firstMob = mobs().get(firstId) as MobShape;
  room.send('move', { x: firstMob.tileX, y: firstMob.tileY - 1 });
  await until(() => {
    const p = me();
    const m = mobs().get(firstId);
    if (!p || !m) return false;
    return Math.max(Math.abs(p.tileX - m.tileX), Math.abs(p.tileY - m.tileY)) <= 3;
  }, 'reached scrap corner', 90000);
  console.log('at the scrap corner', me()?.tileX, me()?.tileY);

  // 2. Wait to get bitten (aggro + windup + bite).
  const hpBefore = (me() as { hp: number }).hp;
  await until(() => (me()?.hp ?? hpBefore) < hpBefore, 'bitten', 30000);
  console.log(`bitten: hp ${hpBefore} -> ${me()?.hp}`);

  // 3. Fight back: swing at any adjacent bot until a kill lands.
  const killTimer = setInterval(() => {
    const p = me();
    if (!p) return;
    for (const [id, m] of mobs()) {
      const d = Math.max(Math.abs(m.tileX - p.tileX), Math.abs(m.tileY - p.tileY));
      if (d <= 1) {
        room.send('attack', { mobId: id });
        return;
      }
    }
    const any = [...mobs().values()][0];
    if (any) room.send('move', { x: any.tileX, y: any.tileY - 1 });
  }, 300);
  await until(() => brawlXp > 0, 'first kill + Brawling XP', 120000);
  console.log(`kill confirmed — Brawling XP +${brawlXp}`);

  // 4. Stand in the corner until knocked flat; expect spawn + full heal.
  await until(() => downs > 0, 'knocked flat', 180000);
  clearInterval(killTimer);
  await sleep(300);
  const p = me() as { tileX: number; tileY: number; hp: number };
  console.log(`down + respawn: tile (${p.tileX},${p.tileY}), hp ${p.hp}`);
  if (p.tileX !== 20 || p.tileY !== 24) throw new Error('respawn tile is not the plaza spawn');
  if (p.hp < 30) throw new Error('respawn did not fully heal');

  // 5. Heatlamp cost gate: no salvage → refusal notice (the sink is gated).
  room.send('placeHeatlamp', {});
  await until(() => notices.some((n) => n.includes('Heatlamp takes')), 'lamp cost notice', 15000);
  console.log('heatlamp cost gate ✓ —', notices[notices.length - 1]);

  console.log('COMBAT PROBE PASSED');
  await room.leave();
  process.exit(0);
}

main().catch((err) => {
  console.error('PROBE FAILED:', err);
  process.exit(1);
});

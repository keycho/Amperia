/** Dev probe: verifies the Signal tuning lock path with a tight node-side loop. */
import { Client } from 'colyseus.js';
import { buildWorldMap } from '@shared/map';
import { targetFrequencyAt } from '@shared/minigames';

const res = await fetch('http://localhost:2567/auth/guest', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: '{}',
});
const { token } = (await res.json()) as { token: string };
const client = new Client('http://localhost:2567');
const room = await client.joinOrCreate('filament', { token });

const map = buildWorldMap();
const shrine = map.nodes.find((n) => n.kind === 'antenna');
if (shrine === undefined) throw new Error('no shrine');
let adj: { x: number; y: number } | null = null;
for (const [dx, dy] of [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const) {
  if (map.walkable[shrine.y + dy]?.[shrine.x + dx] === true) {
    adj = { x: shrine.x + dx, y: shrine.y + dy };
    break;
  }
}
if (adj === null) throw new Error('no adjacent tile');

room.send('selectSlot', { slot: 3 }); // tuner in hand
room.send('move', adj);

let tuneWall = 0;
let loop: ReturnType<typeof setInterval> | null = null;

room.onMessage('nodeEvent', (e: Record<string, unknown>) => {
  if (e.type === 'tuneStart') {
    tuneWall = Date.now();
    const phase = e.phase as number;
    const driftSpeed = e.driftSpeed as number;
    const amplitude = e.amplitude as number;
    console.log('[probe] tuning started');
    loop = setInterval(() => {
      const elapsed = (Date.now() - tuneWall) / 1000;
      const needle = targetFrequencyAt(elapsed, phase, { driftSpeed, amplitude });
      room.send('nodeAction', { nodeId: shrine.id, action: 'tune', needle });
    }, 30);
  }
  if (e.type === 'tuneResult') {
    if (loop !== null) clearInterval(loop);
    console.log('[probe] lockRatio =', e.lockRatio);
    const ratio = e.lockRatio as number;
    console.log(ratio >= 0.8 ? 'HIGH LOCK VERIFIED ✓' : 'lock too low ✗');
    setTimeout(() => {
      void room.leave();
      process.exit(ratio >= 0.8 ? 0 : 1);
    }, 800);
  }
});

// Wait for arrival, then gather (poll our own state tile).
const arrive = setInterval(() => {
  const me = room.state.players?.get?.(room.sessionId) as
    | { tileX: number; tileY: number }
    | undefined;
  if (me !== undefined && me.tileX === adj?.x && me.tileY === adj?.y) {
    clearInterval(arrive);
    console.log('[probe] arrived, gathering');
    room.send('gather', { nodeId: shrine.id });
  }
}, 150);

setTimeout(() => {
  console.log('[probe] timeout');
  process.exit(1);
}, 60000);

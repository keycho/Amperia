/** Dev probe: joins as a guest and exercises a junk-heap gather end-to-end. */
import { Client } from 'colyseus.js';
import { buildWorldMap } from '@shared/map';

const res = await fetch('http://localhost:2567/auth/guest', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: '{}',
});
const { token } = (await res.json()) as { token: string };
const client = new Client('http://localhost:2567');
const room = await client.joinOrCreate('filament', { token });
console.log('[probe] joined as', room.sessionId);
room.onMessage('*', (type, msg) => {
  console.log('[probe:msg]', String(type), JSON.stringify(msg).slice(0, 180));
});

const map = buildWorldMap();
const junk = map.nodes.find((n) => n.kind === 'junkHeap');
if (junk === undefined) throw new Error('no junk node');
let adj: { x: number; y: number } | null = null;
for (const [dx, dy] of [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const) {
  if (map.walkable[junk.y + dy]?.[junk.x + dx] === true) {
    adj = { x: junk.x + dx, y: junk.y + dy };
    break;
  }
}
if (adj === null) throw new Error('no adjacent tile');
console.log('[probe] node', junk.id, 'at', junk.x, junk.y, '→ walking to', adj);
room.send('move', adj);

setTimeout(() => {
  console.log('[probe] sending gather');
  room.send('gather', { nodeId: junk.id });
}, 9000);

setTimeout(() => {
  console.log('[probe] done');
  void room.leave();
  process.exit(0);
}, 18000);

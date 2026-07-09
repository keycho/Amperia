import 'dotenv/config';
import http from 'node:http';
import { Server } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import cors from 'cors';
import express from 'express';
import { guestJoin, linkWallet, loginEmail, registerEmail, verifyToken } from './services/auth.js';
import { FilamentRoom } from './rooms/FilamentRoom.js';

const PORT = Number(process.env.PORT ?? 2567);

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, city: 'AMPERIA' });
});

type Handler = (body: Record<string, unknown>) => Promise<unknown>;
const post = (path: string, handler: Handler) => {
  app.post(path, (req, res) => {
    void (async () => {
      try {
        const result = await handler((req.body ?? {}) as Record<string, unknown>);
        res.json(result);
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : 'Request failed.' });
      }
    })();
  });
};

post('/auth/register', (b) =>
  registerEmail(String(b.email ?? ''), String(b.password ?? ''), String(b.sparkName ?? '')),
);
post('/auth/login', (b) => loginEmail(String(b.email ?? ''), String(b.password ?? '')));
post('/auth/guest', (b) =>
  guestJoin(typeof b.sparkName === 'string' && b.sparkName !== '' ? b.sparkName : undefined),
);
post('/auth/link-wallet', async (b) => {
  const auth = verifyToken(String(b.token ?? ''));
  await linkWallet(
    auth.accountId,
    String(b.walletAddress ?? ''),
    String(b.message ?? ''),
    String(b.signature ?? ''),
  );
  return { linked: true };
});

const httpServer = http.createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define('filament', FilamentRoom);

httpServer.listen(PORT, () => {
  console.log(`[amperia] server listening on :${PORT} — keep the city lit`);
});

# AMPERIA — Progress

## Status after the 2026-07-09 autonomous run (`run-20260709-autonomous`)

The prototype is now a **playable multiplayer vertical slice**: email/guest
accounts, one Filament district on a Colyseus server with Postgres
persistence, all five gathering skills with their active layers running
server-authoritatively, Mastery 1–50, chat/presence, and a first real
graphics pass. Screenshots: `docs/screenshots/` (`devlog-01.png` is the
postcard; before/after pairs for the graphics pass).

### Plan changes (owner-directed)

1. 2026-07-09: after M0.5, skip to the **M2 multiplayer skeleton**, then build
   M1 content inside it (ledger/config/pure-function habits unchanged).
2. Same day, autonomous run (~2h): P0 finish chat/presence · P1 five
   resources server-auth · P2 Mastery · P3 graphics · P4 this wrap-up.

## What exists

### Platform (M2 skeleton)
- **Server** (`/server`, Colyseus 0.16 + Express): FilamentRoom with a 50 ms
  sim loop; server-authoritative movement (shared A*), gathering, inventory,
  chat. Clients send intents; the server rolls ALL value RNG on its own
  clock. One session per account. Joins/leaves broadcast tram notices;
  `/near` and `/help` commands.
- **Accounts**: email+password (bcrypt) and guest accounts (email-less rows,
  upgradeable later); JWT room auth; **SIWS wallet-link endpoint**
  (tweetnacl verify, message must embed the account id) — optional and late
  per CLAUDE.md; nothing in the game requires a wallet.
- **Persistence**: PostgreSQL 16 + Prisma 6 (`/db`): Account, Character
  (tile, pack, hotbar, skills), **LedgerEvent** — every yield writes a row
  (kind, qty, rare, glintHit/lockRatio metadata) + glint reaction-time
  entropy entries (C7 habit). Dev cluster setup: `db/dev-postgres.md`.
- **Client**: LoginScene (warm DOM overlay), WorldScene renders server truth
  (all Sparks animate server-accepted paths; drift-snap correction; node
  state via schema sync), chat log + input, presence chip, Pack/hotbar with
  server-validated drags.

### Gameplay (M1 content, in multiplayer)
- **Five resources, five active layers** (Game Bible B3), all
  server-validated with pure tested math in `/shared/minigames.ts`:
  - Salvage/junk heaps — glint spots (bonus + only path to rare rolls)
  - Brass seams — live-fork spark trails; wrong fork ends the vein early;
    full veins roll Blue-Hot Brass
  - Amperite crystals — pulse-timed strikes (off-pulse = lattice shatter)
  - Glowkoi — canal spots with size/rarity-telegraphed shadows, cast +
    tension-bar reel; Prismatic Glowkoi shimmer
  - Signal antenna-shrines — **the flagship tuner**: drifting target band,
    pointer needle, lock-scaled yield, Ghost Frequencies above 0.85 lock
- **Tools**: Magclaw/Drillhammer/Skimnet/Tuner required IN THE ACTIVE hotbar
  slot (selectSlot intent, server-checked); Riveter inert; starter tool belt
  written at character creation.
- **Mastery 1–50** for all six skills (Brawling/Griddling idle): geometric
  XP curve, XP per act, modest gather-speed curve (-0.6%/level, floor 75%),
  breadth-flag unlocks at 10/20/30/40; skills panel on K.
- **Coolant canal**: built channel (dark coolant, cyan glints, decked bridge
  rows) — never open water.

### Graphics pass (P3 a–d, i)
Golden-dusk breathing wash + corner dusk pools; wet-sheen tile glaze; the
Great Dynamo as a humming centerpiece (halo + staggered coil blooms);
plaza decking seams; overhead string lights (Dynamo → stalls → planter
ring, amber/rose/teal bulbs); procedural stacked-city parallax skyline.

## Verification (all green at HEAD)

- `npm test`: 59 client/shared + 5 server tests.
- Browser e2e (Playwright + real server): two clients see each other move
  and chat; tool gating notice; all five resources gathered through their
  active layers; salvage survives relog via Postgres; node depletion syncs;
  tuner lock 0.81 when tracked at 30 ms cadence vs 0.13–0.15 tracked poorly
  (accuracy pays); ledger rows in Postgres for every grant.

## Known issues / backlog

- Headless-browser verification runs at throttled frame rates — poll
  conditions, never fixed waits (harness notes in scratchpad scripts).
- Remote refuses tag pushes (integration token) — `m0-complete` and
  `run-20260709-autonomous` exist locally; recreate from the commit log if
  needed.
- Spark sprite still the M0 capsule (no walk frames); node silhouettes could
  pop more; no vending machines/graffiti yet; UI reskin partial (login/panels
  warm, but stock browser scrollbars etc. untouched). P3 e–h remainders.
- Amperite has no Manifest rare (the bible names none for it) — flagged for
  a design pass.
- Colyseus schema v3 gotchas documented in server/src/rooms/state.ts
  (defineTypes + useDefineForClassFields:false).
- Old dev accounts created before the starter-hotbar fix have empty hotbars.

## NEEDS RUSTY (deploy)

`DEPLOY.md` + `fly.toml` + `server/Dockerfile` are ready; needs Fly/Railway,
Neon, and Vercel accounts + secrets (~15 min). CORS must be tightened to the
Vercel domain and JWT_SECRET set to a real secret at deploy time.

## Next up

1. P3 remainders: Spark walk frames + scale, node silhouette pass, juice
   (footstep dust, success flourishes), UI reskin, vending machines/graffiti.
2. M1-in-M2 continuation: mobs + Brawling, healing (Dynamo zone + Heatlamp),
   crafting/durability at the Tinkerbench, Bolts + merchant price bands +
   quests (server-side, ledger-logged), Griddling at the Canals stall.
3. M3 retention layer per the bible (Manifest, weekly goals, Rested Charge)
   — still NO token code before M4's gate.

# AMPERIA — Progress

## Status after the 2026-07-10 "bring the city to life" block

On top of the 07-09 slice, the city is now **alive and defended**: the voxel
mass-convert is finished under the locked night-market grade (every world
object built by the in-code pipeline — Kenney world sprites are gone), the
plaza breathes (steam, flicker, embers, canal koi, idle motion, the Dynamo's
heartbeat, harmless plaza Scuttlebots), social presence landed (chat bubbles,
tram toasts, /wave), the first server-authoritative combat slice is in
(feral Scuttlebots in the SE scrap fringe, Brawling click-melee + XP, the
Dented Crest Manifest trophy, cozy death, Dynamo heal zone, placeable
Heatlamp sink), and the whole thing has a synthesized WebAudio soundscape
with a persisted volume setting.

Fresh postcard: `docs/screenshots/devlog-02-alive.png` · scrap corner:
`scrap-corner-mobs.png` · two-client social proof: `social-bubble-toast.png`
· voxel city: `voxel-city-postcard.png`.

### The 07-10 block in commits

- ART-3/ART-4: voxel mass-convert complete (Dynamo hero, nodes with
  depleted bakes, containers/drums, shacks with lit windows + neon signs,
  scuttlebots, heatlamp) + composition pass (shack landmarks, vignette
  clusters, open lanes, planter rows). Kenney keeps UI/icons/particles only.
- L1a–g: stall steam · pooled lantern/sign flicker (never strobing) ·
  ember motes · ambient canal koi + cyan glints · Spark breathing idle +
  label ease-in · Dynamo orbiter + heartbeat pool pulse · three harmless
  plaza Scuttlebots that skitter from players.
- L2a–c: chat bubbles above heads (ChatBroadcast carries sessionId) ·
  tram-arrival toast · /wave emote.
- L3a–d: shared pure mob AI (tested) — idle/wander/chase/windup/return with
  home-leash; server owns spawns/movement/damage/cooldowns; player HP in
  state; bites broadcast combat events; death = full-heal respawn at the
  Dynamo with NO item loss; Brawling click-melee (range+cooldown validated)
  with XP; the Dented Crest trophy (config chance, ledger 'trophy' row) is
  the only mob drop ever; Dynamo heal radius + Heatlamp consumable (Salvage
  sink, ledger 'spend', synced lamp entity with its own light pool).
- L4: WebAudio synth soundscape — Dynamo hum + market murmur by distance,
  gather chirp/glint ding/rare chime/footsteps/UI clicks/chat pop/hurt
  thud/swing whiff, and the Tuner's static→lock sweep tracking accuracy;
  gear panel volume slider, persisted, silent until first gesture.
- e2e probes (node-side, real-time): `server/scripts/probe-combat.ts`
  (aggro → bite → kill+XP → knocked flat → plaza respawn full-hp → lamp
  cost gate) and `probe-heal.ts` (bite → Dynamo regen → gather → lamp
  placed → exactly 6 Salvage sunk) — both PASSED against the live room.

### Tests

76 green (client+shared 71 including the new mob-AI suite, server 5).

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

## NEEDS RUSTY (deploy + accounts)

- `DEPLOY.md` + `fly.toml` + `server/Dockerfile` are ready; needs
  Fly/Railway, Neon, and Vercel accounts + secrets (~15 min). CORS must be
  tightened to the Vercel domain and JWT_SECRET set to a real secret.
- Git tags (`m0-complete`, `run-20260709-autonomous`) exist locally only —
  the remote refuses tag pushes from this session.
- Nothing else is blocked on accounts; no token/chain code exists (M4 gate).

## Next up

1. Owner-queued MATERIALS + COMPOSITION pass: material system in the voxel
   pipeline (rusted steel / gunmetal / wood / painted panel / concrete;
   purple only in shadows), per-block wear/noise, then the market-district
   rebuild (void edges, tramgate→lane→plaza structure, density gradient,
   vignettes, light discipline, ground patchwork, themed node spots).
2. M1-in-M2 continuation: crafting/durability at the Tinkerbench, Bolts +
   merchant price bands + quests (server-side, ledger-logged), Griddling.
3. M3 retention layer per the bible (Manifest panel, weekly goals, Rested
   Charge) — still NO token code before M4's gate.

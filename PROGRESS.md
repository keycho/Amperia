# AMPERIA — Progress

## Status after the 2026-07-10 RENDER OVERHAUL + TANGLE v2 run (R1–R6 + B1–B2)

The whole game got a new renderer, then the Tangle got rebuilt on top of
it. Composite: `docs/screenshots/render-overhaul-before-after.png` · the
new district: `tangle-v2.png` · per-phase progression:
`ref-{lane,tangle}-{before,r1,r2,r3,glow,r4,r5,r6i2,final}.png`.
**Art freeze was lifted for this block only and is back in effect** (level
design for shipped districts follows the §12B brief process).

- **R1 · Shadows + AO** — every voxel model bakes a directional cast
  shadow (height-sheared toward screen bottom-right, matching the
  top-left key light; long shadows off tall things), contact-AO rings at
  the base, ambient wall shade on tiles against tall structures, and
  Sparks carry walking contact shadows.
- **R2 · Block definition** — face ramp widened to top +30% / right −35%,
  1px top-edge highlight bevels, same-material voxel seams, baked
  crevice/overhang AO. Big shapes read BUILT from blocks.
- **SHARP (owner addendum a)** — global NEAREST + roundPixels pipeline,
  zoom clamped to texel-stable steps (0.5/1/2), bake details widened to
  survive decimation. Verified: `sharpness-{before,after}-crop.png`.
- **R3 (+addendum c) · Color grade** — splitTone() curve (darks lean
  teal, lights lean amber, mids hold), three-tier saturation hierarchy in
  the material system, lit faces at FULL material color (awnings vivid,
  rust rich orange) with desaturated shadow faces, and three sanctioned
  accents with meanings: emberOrange (hazard/heat), signalRed (danger,
  sparse), violetNeon (premium signage) — in palette.ts + the
  ART-DIRECTION hex table.
- **GLOW (addendum b)** — one glow language everywhere: hot emissive core
  (hue leaned ≤32% to white — never white-out) + hue bloom + wide skirt;
  bulbs, lanterns, beacons, amperite, and the Dynamo as the biggest
  softest instance.
- **R4 · Terrain elevation** — integer tile levels + ramp/stair rules in
  shared pathfinding (cliff edges block for players AND mobs; server and
  client share the one canStep rule); raised Dynamo plaza behind its
  step ring, loading dock, raised tram platform, sunken canal; platform
  edge faces with lip highlights + foot shadows; elevation-aware
  projection lifts everything automatically. probe-ptrade re-passed on
  the live server over the new terrain.
- **R5 · Atmosphere** — Dynamo god-rays, lamp cones, neon-smearing
  puddles near real lights, warm haze over light clusters, film grain,
  and selective sign life (one BAD flicker, two hue-cyclers).
- **R6 · Self-critique loop** — three scored iterations (log below);
  stopped with nothing under 4.
- **B1 · §12B district briefs** — binding rule in ART-DIRECTION (hue +
  accents, XL landmark, XL/L/M/S mass hierarchy, light plan) with the
  Tangle's brief as the first instance; §12A amended to the new pipeline.
- **B2 · The Tangle v2** — rust-canyon maze: container-stack walls 2-4
  high, the dead Craneking hulk (lattice tower, long jib, hanging claw,
  slow rose apex beacon) over the scrap yard, hazard-amber junction
  lamps ≤5 tiles apart on main routes, teal ONLY as amperite/beacons,
  rose ONLY as Scrapcache/mob/crane, sagging cable bundles between
  pylons, two +1 terraces. Gameplay placements functionally identical
  (node formulas, mob boxes, tram/spawn); probe-travel's full death→
  Scrapcache→reclaim loop re-passed live. Map suite green (27 tests,
  elevation cases included).

### Tests

130 green (client+shared 125 — pathfinding elevation cases new — server
5); both workspaces strict-compile; probes re-run against the live
server after the shared-map changes.

## R6 self-critique log (render overhaul, 2026-07-10)

Rubric scored 1–5 per iteration across BOTH reference angles
(`docs/screenshots/ref-lane-*.png` / `ref-tangle-*.png`); the three
mid-run addendum criteria (sharpness, glow quality, lit saturation) are
scored alongside the original six.

| # | criterion | iter 1 (r5) | iter 2 (r6i2) | iter 3 (final, post-Tangle) |
|---|---|---|---|---|
| 1 | instant depth | 3.5 | 4 | 4 |
| 2 | block crispness | 4.5 | 4.5 | 4.5 |
| 3 | color intent | 3 | 3 | **4.5** |
| 4 | light drama | 3.5 | 4 | 4 |
| 5 | place identity | 2.5 | 2.5 | **4.5** |
| 6 | readability | 4 | 4 | 4 |
| 7 | sharpness (addendum) | 4.5 | 4.5 | 4.5 |
| 8 | glow quality (addendum) | 4 | 4 | 4 |
| 9 | lit saturation (addendum) | 3.5 | 4 | 4 |

- **Iter 1 → 2 fixes** (two lowest renderer-addressable: light drama,
  instant depth): shadow shear 0.95→1.15 + alpha 0.55 (longer, harder
  cast shadows), wall-shade cap 0.26→0.32, dusk vignette 0.42→0.52 —
  the histogram now runs true darks to hot brights.
- **Iter 2 → 3 fix** (the two lowest: place identity 2.5, color intent
  3): Part B's Tangle rebuild — rust-canyon walls, the Craneking, the
  §12B accent discipline. Iter 3 scored on `ref-lane-final.png` +
  `tangle-v2.png`: **nothing under 4 → the loop stops here.**

## Status after the 2026-07-10 PLAYER ECONOMY block (E1–E4)

The city's economy went multiplayer: Sparks now trade with each other,
keep shops that sell while they sleep, and feed a communal weekly meter —
all server-authoritative, ledger-logged, and instrumented. This block also
planted the anti-RMT machinery the token layer (M4) will lean on. Shots:
`docs/screenshots/economy-stall-lane.png` · `economy-trade-window.png` ·
`economy-charge-meter.png`.

- **E1 · Direct trade** — request → accept → both stage items/Bolts →
  both confirm → server-escrowed atomic swap (`shared/trade.ts`, pure +
  15 tests: settleTrade computes on clones and commits only a full
  success — abort/timeout/disconnect/stale-offer can never dupe or lose).
  Offers snapshot server-side from pack slots; any change un-confirms
  both. Ledger rows for BOTH sides carry an estimated value (NPC-band
  midpoint × qty) — the reading anomaly detection consumes. Guardrails
  from day one (config, generous on purpose — the MECHANISM is the
  point): accounts < 24 h can't trade, < 7 d trade under a daily
  estimated-value cap, everyone under a daily trade-count cap; lopsided
  trades (> 8× config factor) write an `anomaly` ledger row, never
  block. `/trade <name>` + a full trade window UI.
- **E2 · Player shops** — the lane grew to 8 rentable stall pitches
  (stable ids on the map). Rent is 150 B/week, DESTROYED (recurring
  sink), 2-week prepay cap, first-come — with the allocation point
  isolated in `ShopService.rent` and a NOTE that premium deed auctions
  replace it at M4. Stock escrows in the DB (version-guarded updates —
  scaled room instances can't double-sell), so stalls sell while the
  owner is OFFLINE: buyer pays gross, 2% fee destroyed, net waits in the
  stall cashbox; "sold while you were away" toast on login; lapsed rent
  vacates the stall into a mailbox that delivers the goods back on next
  login. Occupied stalls show the owner's shingle + top goods on the
  counter — the lane LOOKS stocked. Browse/owner shop panels.
- **E3 · The Citywide Charge v2** — the Warden's Amperite donations feed
  a server-persisted weekly meter (`shared/charge.ts`, pure + tested:
  the Monday-UTC reset IS the week key rolling; thresholds index to the
  active-player count). String-light density scales with the tier (dim
  45% → festival blaze). Weekend city buff: +5%/tier gather XP, cozy
  banner, gathering skills only. Top-10 weekly contributors get the
  untradeable name-glow trim + a Manifest entry, delivered on login.
  **REGALIA ONLY — never Bolts, never tradeable** (commented as
  load-bearing at the math AND the service). `/charge` prints meter,
  tier, and the brightest Sparks.
- **E4 · Instrumentation** — internal `/metrics` page (dev-only;
  production 404s without METRICS_KEY): today's faucets vs sinks per
  source, net supply growth %, median/P90 Bolts, direct-trade volume +
  anomaly count, shop volume, Charge donations, NPC band positions, and
  the last 14 nightly rollups. A nightly job writes one EconomySummary
  row per UTC day — the data spine of the future City Ledger
  (`scripts/rollup-now.ts` for manual runs).

### First economy report (measured 2026-07-10, dev world)

The container rebuild reset the dev DB, so today's ledger holds only this
block's integration probes — treat as a smoke reading of the pipeline,
not player behavior:

```
faucets 0 B · sinks 452 B (stallRent 450 · shopFee 2) · net -452 B
  (-2.91% of the 15548 B supply; faucet Bolts were DB-seeded test money)
23 Sparks · median 200 B · P90 861 B
trade: 2 direct trades / 112 B est · shop 24 B gross · 1 lopsided anomaly
charge: 1660 Amperite donated (festival blaze at the 2-Spark threshold floor)
bands: all at ceiling (salvage 3 · brass 7 · amperite 9 · glowkoi 8 · signal 12)
```

Watch items for the first real week: stall rent (450 B/day from 3 stalls
in probes alone) is now the biggest recurring sink — good; the young-
account value cap (2000 B/day) should be re-checked against honest new
players once quests push past tutorial income; anomaly rows need eyes
weekly (the `/metrics` count is the tell).

### Integration probes (all PASSED against the live server)

`probe-ptrade` (age gate → young value cap → decline → abort → stale-
offer no-dupe → completed swap with Bolts → timeout → disconnect),
`probe-shops` (rent → stock → OFFLINE purchase → away-sales toast +
collect → forced rent expiry → first-come re-rent → goods mailed home),
`probe-charge` (donate → meter + leaderboard → /charge → Monday-key
reset → sweep finalizes → trim delivered on relog). Run the server with
`TRADE_TIMEOUT_SECONDS=5` for the trade probe's timeout leg.

### Tests

127 green (client+shared 122 — trade/charge suites new, map suite
extended for the rentable stalls — server 5). Both workspaces compile
strict.

## Status after the 2026-07-10 FLOOR-FIX → ART FREEZE → CORE LOOP run (P1 + C1–C5)

The city got its final art fix and then its ECONOMY. Part 1 rebuilt the
ground as per-tile baked voxel diamonds (dark asphalt streets, concrete
pavers with a subtle plaza checker, riveted plating on the industrial
fringe, tan lane/boardwalk decking, rugs under the stalls — grid readable
through texture change alone, zero drawn gridlines, zero seams) and killed
the global purple wash: night now lives in dark materials and the void
gradient, purple only in shadows/sky. Check shots
`docs/screenshots/floor-fix-lane.png` + `floor-fix-plaza.png`. **ART
FREEZE is in effect** — no visual work beyond what features inherently
need.

Part 2 wired the core loop end-to-end, all server-authoritative and
ledger-logged:

- **C1 · Bolts + the Nightstalls merchant** — dynamic buy prices inside
  published floor/ceiling bands (`shared/economy.ts`, pure + unit-tested):
  sale volume slides the unit price down mid-transaction
  (path-independent), prices recover lazily per hour from persisted
  `MerchantState`; quote-then-commit so a refused sale never moves the
  band. Sells Warmcups/Cellwax/basic tools at fixed prices. Per-account
  **daily NPC-sale cap** (UTC rollover) — the anti-Sybil throttle.
- **C2 · Tinkerbench** — config recipes (Bolts + resources → tools/
  weapons across Tinker → Brassbound → Coilworked only), tier multipliers
  on gather speed/weapon damage, durability that wears per use, **zero =
  broken, never lost**, repair for Bolts + a config fraction of craft
  materials (`shared/crafting.ts`, pure + tested). Crafts refund inputs if
  the pack can't hold the output.
- **C3 · Quests** — config-schema quests, server-tracked
  (`shared/quests.ts` state machine, tested): the Dispatcher by the
  Tramgate runs the 5-step tutorial (gather → sell → craft → two more
  skills → donate 5 Amperite to the Charge Warden, the Citywide Charge
  stub) ending in the **Dispatch Scarf** — first cosmetic, worn on the
  Spark, never gameplay. Two repeatable dailies under a config daily
  turn-in cap. All copy says *reward*, never "earn".
- **C4 · The Tangle** — second Colyseus room (subclass + district flag,
  one shared codebase): wire-maze container corridors, four alleylamps,
  denser junk/brass/amperite, two antennas, no canal/plaza/Dynamo;
  junkhounds join feral scuttlebots (PvE only). Tram travel both ways for
  a Bolts toll (ledger sink) — charged exactly once per crossing even if
  a client joins the room directly (district-mismatch joins pay too;
  `handleTravel` persists the destination before the go-ahead). Arrivals
  step off at the gate. **Tangle death drops carried resources + Bolts
  into a Scrapcache** — owner reclaims within a config window for a small
  fee, expiry sinks the contents, equipped hotbar gear NEVER drops;
  Filament death stays free. Auth responses now carry the persisted
  district so relog rejoins where the Spark left off. Shots:
  `docs/screenshots/tangle-arrival.png` + `tangle-maze.png`.
- **C5 · Session quality** — `probe-session.ts` proves relog and
  cross-district travel preserve Bolts, pack, tool durability, quest
  state+progress, Mastery XP, and the standing tile, with tolls charged
  exactly once. Live e2e probes all PASSED against the running server:
  `probe-merchant` (band slide + cap), `probe-craft` (craft → wear →
  break → repair), `probe-quests` (full tutorial chain to the scarf),
  `probe-travel` (toll → Tangle → death → Scrapcache → reclaim → home),
  `probe-session`, plus the earlier `probe-combat`/`probe-heal`.

### Balance readout (measured from the economy ledger)

`server/scripts/measure-economy.ts` classifies every Bolts movement in
`LedgerEvent` (player↔cache moves are conservation, excluded):

```
FAUCETS 725 B  = npcSale 300 · tutorial quest rewards 425 (one-time)
SINKS   160 B  = craft 90 · tramToll 35 · scrapcacheFee 20 · wareBuy 12 · repair 3
sink/faucet ratio: 0.221 overall · 0.53 steady-state (excluding one-time tutorials)
```

Against the target ("30 min of normal play roughly covers repair + toll
with modest surplus"): a normal half-hour (mixed gathering/questing, one
Tangle round trip) wears ~60–120 durability ≈ **12–24 B repair** + **10 B
tolls**, while selling its salvage yields **60–150 B** (band 1–3) plus
early quest rewards — costs comfortably covered, surplus funds the next
craft tier (Brassbound wrench = 90 B ≈ one focused session). Early-game
generosity is intentional; the deep sinks are the Coilworked recipes
(180–240 B). **Tuning notes:** if surplus runs hot once tutorials are
spent, the pre-committed levers are salvage band ceiling 3→2,
slidePerUnit 0.004→0.008, and repair boltsPer100 20→30; next recurring
sinks queued for M3 are stall rents, Bolts-paid Fortune Coil spins, and
structure upkeep. The daily NPC-sale cap (1500 B) and the band slide
already make farm loops self-depressing.

### Tests

103 green (client+shared 98 — economy/crafting/quests/tangle-map suites
included — server 5). Both districts compile strict; probes run against
the live server.

## Status after the 2026-07-10 MATERIALS + COMPOSITION pass

The "too purple" world is gone. Every voxel asset is now built from real
MATERIALS (rusted steel, gunmetal, wood/decking, weathered painted panels,
concrete) with per-voxel value noise, chipped edge wear, stain streaks and
a grounding gradient — purple survives only in shadows, the night air, and
the void. The map is a real market district: Tramgate arrival → a
stall-lined lane (awning-to-awning, per-stall sign colors) → the Dynamo
plaza with a raised step ring, buildings walling the edges with alley
gaps, dark corner clutter with dim lanterns, the roped SE scrap yard
(brass + amperite among the Scuttlebots), junk in the alleys, antennas on
the dark outskirts with cables to the nearest roofs, a ground patchwork
(plating/seams/rivets/grates, lane + boardwalk decking, stall rugs,
stains) and a void that fades the last rows to near-black. Check shots:
`docs/screenshots/lane-view.png` + `plaza-view.png` (see also
`materials-test-wide.png`, `materials-all.png`).

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

- A same-instant relog could race the previous session's onLeave persist
  (the probe pauses ~0.8 s like a human would; the travel path is
  race-free since it persists before travelGo). Hardening: serialize
  join-vs-pending-persist per character.
- The remembered district lives in localStorage on top of the auth
  response; cross-device relog after traveling elsewhere falls back via
  the client's ride-home path. Canonical fix: a `/auth/whoami` endpoint.
- Headless-browser verification runs at throttled frame rates — poll
  conditions, never fixed waits (harness notes in scratchpad scripts).
- Remote refuses tag pushes (integration token) — `m0-complete` and
  `run-20260709-autonomous` exist locally; recreate from the commit log if
  needed.
- Spark sprite still the M0 capsule (no walk frames); UI reskin partial.
  ART FREEZE: none of this moves until the freeze lifts.
- Amperite has no Manifest rare (the bible names none for it) — flagged for
  a design pass.
- Colyseus schema v3 gotchas documented in server/src/rooms/state.ts
  (defineTypes + useDefineForClassFields:false).
- Old dev accounts created before the starter-hotbar fix have empty hotbars.
- The Tangle's Scrapcache marker uses the standard rose beacon — reads
  fine, but a distinct silhouette at distance would help (post-freeze).

## NEEDS RUSTY (deploy + accounts)

- `DEPLOY.md` + `fly.toml` + `server/Dockerfile` are ready; needs
  Fly/Railway, Neon, and Vercel accounts + secrets (~15 min). CORS must be
  tightened to the Vercel domain and JWT_SECRET set to a real secret.
- NEW (economy block): set `METRICS_KEY` in production so `/metrics` is
  reachable at `…/metrics?key=<value>` (without it the page 404s in
  prod — safe default). The nightly EconomySummary rollup runs inside
  the game server process; nothing extra to schedule.
- The dev DB was recreated after a container rebuild (same
  `db/dev-postgres.md` steps + `npm run migrate:dev -w db`); production
  Neon will need `prisma migrate deploy` on first ship — 4 new
  migrations landed this block (trade guardrails, shop stalls, the
  Citywide Charge, economy summaries).
- NEW (identity block I0): the mascot image attached to the kickoff brief
  could not be read from this environment, so `docs/brand/spark-mascot.png`
  is the bust REBUILT faithfully through the real voxel pipeline (rose mop,
  black goggle band + teal lenses, plum collar + amber tag, glowing bulb,
  3-tone shading). It works as the canonical in-pipeline reference; if the
  original artwork should also live in the repo, drop it in as
  `docs/brand/spark-mascot-original.png` — no code references it.
- Git tags (`m0-complete`, `run-20260709-autonomous`) exist locally only —
  the remote refuses tag pushes from this session.
- A second district doubles room count per instance — no action needed
  now, but pick the Fly VM size with both rooms + headroom in mind.
- Nothing else is blocked on accounts; no token/chain code exists (M4 gate).

## Next up

1. Balance watch: `/metrics` daily + the nightly rollups after real
   playtests; pull the pre-committed levers (band ceiling / slide /
   repair rate / stall rent) only if steady-state surplus runs hot.
   Stall rent landed this block; still queued from M3's sink list:
   Bolts-paid Fortune Coil spins and structure upkeep.
2. M3 retention layer per the bible: Manifest panel, weekly goals, Rested
   Charge, Griddling — still NO token code before M4's gate (D7/D30
   targets must be hit with the token off).
3. Anomaly review habit: eyeball the `/metrics` anomaly count weekly and
   sample the `anomaly` ledger rows — the lopsided-trade flag is
   instrumentation-only until there's data to justify enforcement.
4. Post-freeze art batch (walk frames, node silhouette pops, UI reskin
   remainder) once the owner lifts the ART FREEZE.

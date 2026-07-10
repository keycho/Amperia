# AMPERIA — Progress

## Status after the 2026-07-10 U0 DOORS-OPEN HARDENING (H1–H5)

The gate before deploy — onboarding, moderation, load, ops, and the
weekly balance habit. All green; U0 no longer blocks the doors.

- **H1 how-to-play** — four intro cards in the city's voice (move &
  gather · tools & trades · the city works · the Tangle bites) auto-show
  once after the first-login creator, skippable at every step, reopenable
  from the [?] HUD button; /help speaks the same four breaths. Comms-
  rules clean.
- **H2 moderation minimum** — `/mute <name>` persisted per account (chat
  AND bubbles stop arriving; survives relog; the muted are never told),
  `/unmute`, `/report <name> <reason>` → Report row + ledger event +
  quiet confirm, chat rolling rate window (config 6 per 10s, one
  cooldown notice per burst), and a leet-aware profanity SOFT filter
  (masks, never blocks). Weekly review: `npx tsx scripts/list-reports.ts`.
  Verified live with a three-bot probe.
- **H3 LOAD TEST (the numbers)** — 50-bot weighted swarm (45% move, 20%
  gather, 10% chat, 10% shop browse, 5% trade asks, 5% tram hops with
  real tolls), 10 minutes, 16,770 intents, 23 cross-room tram hops,
  **zero errors, zero reconnects**. Peak **46 CCU in one filament room**:
  tick p50 0.1–0.2ms, **p95 ≤ 0.6ms, max single tick 2.3ms against the
  50ms budget (~1% utilization)**. Memory rss 149→182MB over the run
  (heap steady at 24–32MB — no heap growth; rss is allocator pools), DB
  pool steady at 10 connections (prisma default), no saturation. **No
  hotspots to fix** — nothing rose above noise.
  **Documented capacity: keep `maxClients = 40` per room instance** (the
  cap is gameplay density + patch fan-out, not CPU — measured headroom
  says one instance could carry 100+ CCU before the tick budget matters).
  **The instance-spawn threshold IS the cap: Colyseus opens a fresh room
  instance automatically when one fills at 40.** Load tests can raise it
  via ROOM_MAX_CLIENTS. VM sizing: 4 idle district rooms ≈ 150MB rss,
  ~+30MB under a full house.
- **H4 ops basics** — structured JSON logs to daily rotating files
  (LOG_DIR/LOG_KEEP_DAYS), boot + uncaught-error alerts to an optional
  ALERT_WEBHOOK (a restart announces itself), crash-fast on uncaught
  exceptions under a supervisor, per-IP /auth rate limit
  (AUTH_RATE_PER_MIN, default 20 — verified 20/30 in a burst), and a
  full .env.example audit (every var the server reads, no secrets).
- **H5 balance watch** — `npx tsx scripts/weekly-report.ts`: sink/faucet
  ratio, median + P90 Bolts, top sinks/faucets, trade + anomaly counts,
  rollup trail — one command; the §5 levers and the one-lever-a-week
  rule documented in its header.

## Status after the 2026-07-10 GRIT PASS (G1–G6b)

The world stopped reading smooth at medium/wide zoom. Two bake-level
fixes, A/B'd and owner-picked, plus the launch image and real world edges.
Shots: `grit-{A-none,B-6px,C-8px}-{close,play,wide}.png` ·
`docs/marketing/world-{poster,banner-x,square}.png`.

- **G1 fixed texel density** — every voxel model, shadow, and floor tile
  still bakes at 2× with all its R2 detail, then decimates to N texels
  per voxel edge (nearest) and draws scaled back up: the chunky pixel
  grid rides the WORLD at every zoom. Toggle `?grit=none|6|8` follows the
  parked ?style pattern (`render/grit.ts`). Outlines/bevels/seams/stains
  widen to survive as exactly one texel.
- **G2 face grit at texel scale** — per-texel speckle mosaics on exposed
  material faces (per-material amounts in materials.ts: strong rust/
  concrete, subtle paint), scratch ticks on ~20% of faces, corner
  edge-wear texels, per-texel floor speckle by floor kind. Smooth bake
  untouched when grit is off.
- **G3** film grain 0.05 → 0.075 (felt, not seen).
- **G4/G5** — nine A/B shots at the same Nightstalls angle; the owner
  picked **B (6 texels per voxel edge)**; default flipped, §7 readability
  re-checked in the Tangle and on the lane: neon-pop discipline, Spark
  warm-rim pop, and silhouette outlines all hold. No dial-backs needed.
- **G6b world edges** — the map ENDS, it doesn't fade: camera-facing
  borders carry a deck-edge rim (metal lip, exposed girders, hazard
  striping), support trusses fading into the dark BELOW the city, warm
  rim lamps, and per-district character (Tangle torn spans, Filament
  promenade rails, Terrarium vine overhang); far edges get a curb lip;
  tram trestles march off-map at every gate. The §B5 street-level fade
  dialed way back to a mild edge dimming.
- **G6 the launch image** — `tools/world-poster.mjs` re-rendered
  `docs/marketing/world-poster.png` at 4096×2304: all four districts as
  screen-blended islands in true black void, tram line strung gate to
  gate, the Dynamo as the city's bright heart, rims selling "structure
  floating in the dark." Plus the 1500×500 X banner and 2048×2048 square.

## Status after the 2026-07-10 NEW DISTRICTS block (T0 + D1–D4)

The city grew from two districts to four — THE STACKS (the vertical
quarter) and THE TERRARIUM (the hanging gardens) — and got connected:
one tram line, per-hop tolls, a world map, and a marketing poster.
Briefs first: both districts entered `ART-DIRECTION_1.md` §12B before any
code, plus the Part I §5 amendment (tall structures are blocking world
objects, never interiors; walkable levels ride +2/+3 via elevation;
anything that can occlude the player requires occlusion fade).
Shots: `stacks-{canyon-street,junction-plaza,roofline,spire}.png` ·
`terrarium-terraces.png` · `loftpod-decorated.png` · `worldmap-screen.png`
· `docs/marketing/world-poster.png`.

- **T0 occlusion fade** (`client/src/systems/OcclusionFade.ts`) — any
  registered tall prop between the camera and your Spark (or the hovered
  tile) eases to 35% opacity and back; window-glow overlays ride along as
  companions scaled by the base alpha. Verified with a bot walking behind
  a tower (alphas 0.37 hidden / 1.0 clear). Applies to all districts.
- **D1 THE STACKS** — canyon streets between 5–9 storey towers (13 baked
  variants off one generator, every roofline distinct: tanks, antenna
  clusters, tarp shanties, one pinned rooftop garden), window-light spill
  as the district's texture, laundry/cable-web overhead, ONE licensed
  violet sign per street, the junction plaza (noodle cart, tree planter),
  a stair run to THE ROOFLINE (+3 walkable terrace across three towers:
  two market stalls, the Tuning shrine with the city's best Signal —
  +75% yield server-side, ledger-tagged `roofline`), and the SIGNAL SPIRE
  with its slow red crown. The Vanity Registry is a street-level
  shopfront with a closed door ("appointments open after the first
  season") — the future token-layer tie-in, no code behind it. PvE-safe;
  highest ambient-life density (balcony citizens, roofline laundry-bot).
- **D2 THE TERRARIUM** — three stepped terrace bands (deck, never lawn),
  planter rows, tool sheds, compost heaps, firefly motes, and the MOTHER
  TRELLIS wearing glow-fruit lamps. Peaceful scavenging: compost glints
  reroll into GARDEN rares (silverfern, emberseed) that open the new
  Gardens Manifest page (Seedkeeper title). LOFTPODS: one pod per Spark
  on server-managed berths (DB uniqueness IS the slot manager), `/haul`
  to move, 3 upgrade tiers, 4 dyes, trophy hooks showing a Manifest title
  + Mastery banner — every cost a Bolts/resource sink, every knob
  display-only. PvE-safe, no mobs.
- **D3 CONNECT THE CITY** — the tram line Filament ↔ Stacks ↔ Terrarium ↔
  Tangle with tolls charged PER HOP (`shared/travel.ts`, config-tuned).
  Tramgates open a stop board listing every other district and its fare.
  District-sticky relog verified across all four (circuit bot: tolls
  5/5/5/15 ledger-logged with hop counts, blind relog lands home
  toll-free). Weekly goals gained district reasons to ride (tram rides,
  Stacks salvage, Roofline signal, Terrarium compost) via a district
  filter on goal events. The Citywide Charge hook now reaches every
  district: Stacks window blaze scales ember→quarter-blazing by tier;
  Terrarium garden lamps fill in from half-lit (the Trellis never goes
  dark).
- **D4 THE WORLD MAP** — TAB opens the map screen: all four districts as
  mini-iso islands drawn from their REAL walkable grids in their accent
  colors, the tram line gate-to-gate, tramgates as amber diamonds, your
  Spark pulsing where you stand. And `tools/world-poster.mjs` renders
  `docs/marketing/world-poster.png` (2560×1440): four visibly different
  quarters, one city in the dark.
- **Deferred by design**: The Canals district + the Griddling skill move
  to post-launch content — the four-district city is the launch shape.
- Tests 182 green (+6 travel/goal). Photo mode grew two habits: empty
  berth-pad markers hide on film, and the marketing rig
  (`tools/marketing-shot.mjs`) was rebuilt + committed after the
  container restart ate its first uncommitted version.

## Status after the 2026-07-10 WORLD VARIETY pass (V1–V6)

Killed the "everything is a box" monotony — shape language and content
variety per §12A, all client/shared presentation (no server-value code
touched). Shots: `v1-variants-{filament,tangle}.png` ·
`v2-shapes-{dock,south,tangle}.png` · `v3-buildings-{north,west}.png` ·
`v4-{griddle-corner,tramcar,fountain,draymule,spill}.png` ·
`v5-{footbridge,walkway,overlook}.png` ·
`v6-{griddle-cook,angler,mechanic}.png` ·
`accept-{filament,tangle}-{1..4}.png` · `accept-passing-lane.png`.

- **V1 repetition breaking** — every common prop carries a pool of baked
  looks (crates ×4, planters ×4, junk-heap silhouettes ×3 with their own
  depleted forms, painted/rust containers ×6 each, drums ×2, canyon-stack
  alt twins); `VariantPicker` chooses per position hash with an adjacency
  guard — **two identical models never sit orthogonally adjacent** even
  packed solid (unit-tested, 7 tests).
- **V2 shape vocabulary** — 8 new prop kinds across four families: fabric
  (canopy, banner, laundry line), organic (wildbush ×3, vine-eaten
  trellis), tall/thin (signpost, stovepipe with live steam), round-ish
  (the water tank). Placed in both districts behind full guards
  (footprint-walkable, node-access preserved, rect flood-fill seal check).
- **V3 building variety** — the single shack became EIGHT designs (classic
  parapet / two-storey + rain barrel + whip / L-shape + skylight annex /
  quonset vault / lean-to + clerestory / stacked setback + terrace / watch
  kiosk + weather vane / gabled cottage + dormer). **No bare roofs** —
  rooftops are 40% of a building's read in iso, so every one carries
  furniture. Picker reach 6 keeps whole streets varied.
- **V4 unique set pieces** — Filament: the Griddle noodle corner (pot
  steams, lanterns spill), a retired tram car on its siding, the scrap
  fountain trickling coolant-teal. Tangle: a Draymule up on blocks under
  a work lamp, the container spill across the south corridor.
- **V5 elevation in use** — a railed canal footbridge (deck +1 over the
  coolant, koi kept off its row), a raised north walkway whose row is
  CHOSEN at build time (longest clean run after scatter — a hard-coded
  row sealed six tiles; the search keeps reachability), and the Tangle's
  SW terrace dressed as an overlook (rim guardrails, stash, lamp).
- **V6 ambient life** — six idle citizens (client-only, no nameplates:
  the Griddle cook, a canal angler mid-skim, a dock loafer, a stalls
  browser, a mechanic riveting at the Draymule, a scavver on the spill),
  chimney steam on every flued building design, ember motes around the
  junction lamps.
- **§12B(e) added to ART-DIRECTION** (binding): boxes ≤ 60% of objects per
  screenful; common props ship 3–4 looks with adjacency-guarded picks.
- **Acceptance**: 4 spread screenfuls per district + the passing lane all
  verified — each contains a non-box silhouette, a unique thing, and no
  identical adjacent props. Tests 165 green (was 160; +7 picker −2 merged
  map asserts +5 V5 invariants). Note from the pass: the "solid pink
  spark" seen in Tangle shots is `flashHurt()`'s 90 ms rose tint-fill
  catching bots mid-fight — verified not a render bug.

## FEATURE-COMPLETE FOR PUBLIC PLAYTEST (2026-07-10, after the RETENTION SPINE)

With the retention spine in, the game now has its full pre-token loop:
gather → craft → trade/shops → identity → collection → weekly rhythm →
daily rituals → safe storage. **We believe this is feature-complete for a
public playtest** (M3 scope; the M4 token gate stays shut until D7/D30
targets are hit with the token off).

What we think still blocks opening the doors (see NEEDS RUSTY for the
account-shaped items):

1. **Deploy + accounts** — Fly/Neon/Vercel setup, prod JWT secret, CORS,
   `prisma migrate deploy` (9 migrations now). ~15 min of Rusty's time.
2. **A second room instance under load is untested** — one Colyseus
   process holds both districts fine at playtest scale, but we've never
   run 50+ concurrent Sparks; a quick load probe post-deploy is wise.
3. **Moderation basics** — chat has rate limits + length caps but no
   mute/report; acceptable for a small invite wave, not for open doors.
4. **Onboarding polish** — the Dispatcher chain teaches the loop, but
   there's no "how to play" screen; fine for playtest, worth a pass.
5. **Balance watch** — the levers exist (`/metrics`, nightly rollups);
   somebody has to look at them weekly once real players arrive.

## Status after the 2026-07-10 RETENTION SPINE block (S0–S5)

The systems that make people come back — all server-authoritative,
config-driven, ledger-logged. Shots: `nameplate-fade.png` ·
`manifest-{toast,panel,hints}.png` · `goal-board.png` ·
`coil-{mid-spin,prize}.png` · `ledgerhouse-interior.png`.

- **S0 · Nameplate fading** — full names ≤8 tiles, faded to 13, hidden
  beyond; always-on in quiet rooms; the last-inspected Spark stays lit.
- **S1 · The Manifest (M)** — account-wide collection log: the four rare
  gather rolls, the Dented Crest trophy, every wardrobe cosmetic; pages
  per skill/mobs/wardrobe; silhouettes + hints undiscovered, thumb +
  count + first-date discovered; page completion = untradeable titles
  (shown on the inspect card), the full book = the Archivist's Glow trim;
  discovery toast + chime. Recorded ONLY off real grant paths.
- **S2 · The goal board (G)** — 8 deterministic weekly goals from the
  config pool (Charge week key), progress on all, REWARDS claimable on
  any 5 (hard ceiling), zero streak state anywhere; 5th claim each week
  = a regalia token; tokens → the Circuit Banner (BACK slot). Bumps ride
  only server-verified actions.
- **S3 · Rested Charge** — first 40 gathering-minutes daily: gather XP
  ×1.25, XP ONLY (faucet untouched, combat excluded); warm HUD line;
  burns only while gathering; refills daily, never punishes.
- **S4 · The Fortune Coil** — the carnival wheel at the Nightstalls: ONE
  free spin a day, 5.4s ratchet-ticking spin, confetti on good hits,
  bystander-visible. Prize table in config (all untradeable): small
  Bolts, consumables, Coil shards → the Glimmer Trail (pity-ramped,
  duplicate-converting), a Manifest filler. THE HARD RULE stands three
  ways: typed no-currency brand on the intent, assertFreeSpin at the
  handler, ledger 'anomaly' on any smuggled currency key (verified live).
  No paid-spin codepath exists.
- **S5 · The Ledgerhouse** — the bank hall NW of the plaza (walk in
  through the south door; every action re-checks the hall tiles): 48
  base slots, deposit/withdraw by stack, +8-slot expansions on a steeply
  rising Bolts curve (400 → 45,000 — the hoarder sink); death NEVER
  touches the vault (integration-probed: deposit → die in the Tangle →
  Scrapcache takes the pack, the vault keeps everything).

Tests: 155 client+shared + 5 server green; 5 new migrations this block.

## Status after the 2026-07-10 CHARACTER IDENTITY block (I0–I6)

Sparks became people. The canonical mascot is in the repo, the base body
is rebuilt to its proportions, players shape their own look on first
login, and the wardrobe carries real cosmetics — all server-authoritative
and ledger-logged. Shots: `docs/brand/spark-mascot.png` (brand reference)
· `mascot-vs-model.png` · `spark-sheet.png` (all dirs/frames/poses) ·
`creator-{first-login,customized,remote-view,wardrobe}.png` ·
`wardrobe-slots.png` · `spark-lineup-lane.png` · `spark-bulb-hat-night.png`
· `inspect-card.png` · `catwalk-{tramgate,plaza}.png` · `ui-pack-thumbs.png`.

- **I0 · The mascot** — `docs/brand/spark-mascot.png`: the bust rebuilt
  through the real voxel pipeline (rose mop, black goggle band + teal
  lenses, plum collar + amber tag, glowing bulb) at 1000px on black; the
  permanent reference all character work compares against. (The original
  attachment bytes were unreachable in this environment — see NEEDS RUSTY.)
- **I1 · The Spark body** — mascot-proportioned rebuild (head ≈45% of
  height, visible hands, boots, layered jacket + tool-belt), FOUR real
  direction bakes (transpose, never texture flips), weighted walk cycle
  (stride A/B + raised passing frame + forward lean), gather poses per
  tool + a brawl pose, server-broadcast `pose` state so remote clients
  render working Sparks; the own Spark turns to face the node it works.
- **I2 · The creator** — first-login "SHAPE YOUR SPARK" (5 warm skins, 6
  hair styles, 6 hair colors, 5 jackets, 4 flair picks — index 0 is the
  mascot preset), live preview of the REAL baked sprite on a lit pedestal,
  randomize, one-time name pick; compact validated wire code persisted in
  Postgres and broadcast so every client re-bakes (two-browser verified).
  `/wardrobe` reopens the look-only version.
- **I3 · The wardrobe** — anchor slots per §10.2 (HEAD/BACK/JACKET/TOOL/
  TRAIL/NAME-GLOW). THE BULB HAT is the final Dispatcher-chain reward
  (with its own walking glow); scarf moved to JACKET (tut3), Salvager
  Satchel BACK (tut4), Alley Beanie = rare junk-heap cosmetic roll,
  Brassbound Tools = Tinkerbench cosmetic recipe (Bolts+brass sink, zero
  stats), Charge trim = NAME-GLOW. ONE grant path: ledger-logged
  ('cosmetic'), auto-equip, persisted. All untradeable.
- **I4 · Hybrid UI** — Kenney 9-slice chrome (3 curated pieces, ALWAYS
  re-tinted ink/plum), item thumbnails baked from the voxel pipeline on
  plum cards (tier accents are real voxels, never tint washes), slot
  states (empty dim inset / filled thumb + rarity edge-glow), terminal
  text stays for chat/system.
- **I5 · Social proof** — click a Spark → inspect card (baked portrait on
  a dais, crew placeholder, top-3 Mastery, worn list, [offer trade] — the
  first client-side trade entry point); catwalk light pools at the tram
  platform + plaza rim (breathing, additive, light-only).
- **I6 · Props + housekeeping** — kenney_voxel-pack ships NO .vox sources
  (verified), so the vignette props were BUILT through the material
  system: 8 families × variants (spools, barrels, pallets, vent, gas
  cans, tarps, bins, tool rack) arranged in three Filament vignettes;
  isometric zips retired to `assets/_retired/`, extracted voxel-pack PNGs
  removed (icons are all baked now).

Numbers: 137 client+shared tests + 5 server tests green; both workspaces
strict-compile; 2 new migrations (appearance, equipped).

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
- NEW (retention block): production Neon needs `prisma migrate deploy`
  for 9 total unshipped migrations (appearance, equipped, manifest,
  weekly_goals, rested_charge, fortune_coil, ledgerhouse_bank + the two
  economy-era ones). One command, listed here so it isn't a surprise.
- NEW (retention block): the Coil's daily gate and the goal week both key
  off UTC — worth a line in any player-facing FAQ ("the city's day turns
  at midnight UTC").
- NEW (identity block I0): the mascot image attached to the kickoff brief
  could not be read from this environment, so `docs/brand/spark-mascot.png`
  is the bust REBUILT faithfully through the real voxel pipeline (rose mop,
  black goggle band + teal lenses, plum collar + amber tag, glowing bulb,
  3-tone shading). It works as the canonical in-pipeline reference; if the
  original artwork should also live in the repo, drop it in as
  `docs/brand/spark-mascot-original.png` — no code references it.
- Git tags (`m0-complete`, `run-20260709-autonomous`) exist locally only —
  the remote refuses tag pushes from this session.
- NEW (districts block): one more migration for production Neon —
  `20260710180503_loftpods` (the Terrarium housing table). Same
  `prisma migrate deploy`; that makes 10 unshipped migrations total.
- NEW (districts block): the server now defines FOUR room types
  (filament, tangle, stacks, terrarium) — an idle room per district per
  instance. Size the Fly VM for four rooms + headroom, not two.
- NEW (U0): when creating the production database project (Supabase),
  ENABLE DAILY BACKUPS + point-in-time recovery from day one — it's a
  checkbox at project creation, and there is no honest recovery story
  without it.
- NEW (U0): set ALERT_WEBHOOK in prod (any Slack/Discord-style POST
  {text} hook) so restarts and uncaught errors reach a phone; logs
  rotate under LOG_DIR (default ./logs) on the instance disk.
- NEW (U0): one more migration for production — `20260710210612_moderation`
  (Mute + Report tables); 11 unshipped total, same `prisma migrate deploy`.
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

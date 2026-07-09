# AMPERIA — Progress

## Status: `m0-complete` (M0 prototype done; next up: M2 multiplayer skeleton by owner directive)

### Plan change (2026-07-09, from the project owner)

After M0.5, we skip directly to **M2's multiplayer skeleton** (Colyseus, one
district room, email-first accounts with optional SIWS, Postgres persistence,
chat) and then build **M1's content inside multiplayer**. The M0/M1 habits are
unchanged and mandatory: ledger logging for every value movement,
config-driven constants in `/shared/config.ts`, pure unit-tested value
functions, palette-only colors, comms-rules-compliant UI strings.

## What exists (M0)

- **Monorepo**: `/client` (Phaser 3.90 + Vite 7 + strict TS), `/shared`
  (config, palette, pure game math + Vitest suites), `/assets` (curated
  Kenney CC0), placeholder `/server` `/db` `/economy` dirs. Root
  `npm run dev|build|test|lint` proxy to the client workspace.
- **M0.1 iso world**: 40×40 map from `shared/map.ts` (deterministic builder:
  Great Dynamo 4×4 at plaza heart, Nightstalls-style stall row, planter ring,
  scrappy crate/block fringe, 15 junk-heap nodes; flood-fill-tested
  reachability). Floor renders as ONE static Graphics (shared vertices → no
  seams at any zoom, single draw call) with palette-mixed per-tile variation:
  warm decking plaza, mauve plating fringe cooling toward the edges.
- **M0.2 camera**: pointer-anchored wheel zoom (0.5×–2×), middle-mouse drag
  pan, edge pan, lerped follow; manual pan pauses follow, movement re-engages.
- **M0.3 movement**: `shared/pathfinding.ts` 4-directional A* (no diagonal
  corner-cutting by construction) + `findPathAdjacent`; Spark walks
  tile-to-tile with tweens, continuous depth = anchor worldY; neonTeal hover
  outline + destination pulse.
- **M0.4 gathering**: junk heap → Salvage with the glint-spot active layer.
  `shared/gathering.ts` pure rolls (glint multiplies yield ×1.5; rare-find
  Gilded Scrap ONLY on glint hits; per-cycle random glint timing) —
  statistically tested (attentive > passive by >20%). Click heap → A* to an
  adjacent tile → 2.6 s cycle with progress bar → loot float text → node
  depletes → 20 s respawn. Walking away cancels the cycle.
- **M0.5 inventory/hotbar**: 24-slot Pack panel (I toggles, Esc closes) +
  6-slot hotbar (keys 1–6, neonAmber active ring), drag to move/merge/swap
  across both containers (pure `shared/inventory.ts` math), loot chip.
- **Verification harness** (not shipped): Playwright + preinstalled Chromium
  drives the real game (clicks, keys, drag, condition-polling) and
  screenshots it; used at every milestone. Note: headless frame throttling
  makes game-time run slow/erratic — poll conditions, never fixed waits.

## Config (all tunables in `/shared/config.ts`)

Tile 64×32 · map 40 · zoom 0.5–2 · 0.21 s/tile walk · heap: 15 nodes,
2.6 s cycle, 1–3 yield, ×1.5 glint, 8% rare on glint, 20 s respawn ·
inventory 24×999, hotbar 6.

## Assets used (all Kenney CC0; packs zipped in `/assets/_zips`)

- `kenney_isometric-blocks`: voxelTile_09/18/26/29/30/42/46/47 (structure
  cubes, tool crate, planks, ore cubes for M1 Brass/Amperite),
  platformerTile_22/23 (crates)
- `kenney_isometric-buildings`: buildingTiles_004/012/014/020/030/043
  (stall row shopfronts)
- `kenney_particle-pack`: circle_02/circle_05 (soft glows), spark_04/05
  (glints), star_06
- `kenney_voxel-pack` (for M1 items): hammer/pick/sword/fishingPole/fish/
  fish_cooked/ore_iron/ore_gold/ore_diamond/stew/bowl
- `kenney_game-icons` (white 2×, for UI): wrench, signal2, gear, cross,
  question, save, shoppingBasket, trophy, star, checkmark, exclamation, locked
- Everything else is generated at boot from the locked palette
  (`client/src/render/textures.ts`): Dynamo, Spark, heaps, planters, markers,
  item icons. Kenney sprites are always warm-tinted via palette blends
  (`client/src/render/tints.ts`) — nothing ships the stock daylight look.

## Known issues / polish backlog

- Planter foliage reads slightly mint at small sizes; revisit solarGreen
  shading.
- The Dynamo placeholder's left rim-light band is faint; the dome could use a
  touch more warm bounce.
- Junk heaps could pop slightly more against fringe blocks (amber chip helps;
  consider a faint idle shimmer).
- No wet-sheen ground glaze yet (ART-DIRECTION "lightly reflective tiles") —
  deferred to a polish pass.
- No audio at all (out of scope so far).
- FPS in the CI-style headless browser is throttled (not representative);
  desktop browsers idle at 60.

## What M2 starts with (next)

1. `/server`: Colyseus (TS) — one Filament district room; server-authoritative
   movement + gathering (shared A*/gather math runs server-side; client sends
   intents, renders results).
2. Accounts: email-first (password hash), SIWS wallet linking optional and
   late; Postgres + Prisma persistence (accounts, inventories); `/db` schema.
3. Chat + presence; remote Sparks rendered from room state.
4. M1 content (5 resources with active layers, Mastery, mobs/Brawling,
   healing, crafting/durability, merchant price bands + quests + economy
   ledger) built ON the multiplayer skeleton, per owner directive.

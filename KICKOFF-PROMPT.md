# AMPERIA — Claude Code Kickoff Prompt

*Copy everything below the line into Claude Code in an empty folder (containing only `CLAUDE.md`, `AMPERIA-Game-Bible.md`, `ART-DIRECTION.md`, and `AMPERIA-Economy-Design.md`) and let it run. It is written to keep Claude working autonomously through M0 and into M1 with clean commits.*

---

You are building **AMPERIA**, an isometric cozy salvage-punk MMO. Before writing any code, read `CLAUDE.md`, `AMPERIA-Game-Bible.md`, `ART-DIRECTION.md`, and `AMPERIA-Economy-Design.md` in this folder — they are the source of truth for world names, architecture rules, the locked visual palette, and the token economy. Follow them exactly.

## North star (keep these in mind through every milestone)

- **Economy direction:** $AMP is a fixed-supply pump.fun token — no minting, ever. The design is a **buy-and-burn flywheel**: free-to-start game → players buy $AMP for the premium/status layer → every $AMP spend burns a share + funds the treasury → treasury (pump.fun creator fees + premium revenue) runs buyback-and-burn and refills a finite prestige-reward reserve. **Bolts (soft) is a closed loop with recurring sinks** (durability, repair, upkeep, consumables) and is never exchangeable into $AMP. $AMP never buys power. Every faucet you build must have a matching sink, and every value movement gets ledger-logged. None of the on-chain code exists until M3 — but the *habits* (config-driven constants, ledger logging, pure tested economy math) start at M0.
- **Art style:** cozy salvage-punk per ART-DIRECTION.md — warm golden-dusk, voxel/chunky-sprite look, palette-only colors, saturated neon reserved for interactables. Ground is decking/plating/pavement, never grass or water-as-terrain. Then work through the milestones below **one checkbox at a time, committing after each with a clear message**. Do not skip ahead, do not scaffold future milestones early, and do not stop to ask me questions unless you hit something truly blocking — make the reasonable choice, note it in the commit message, and continue. Work until M0 is fully done and verified, then continue directly into M1 in order.

## Project setup (do this first)

1. Initialize a git repo. Create the monorepo skeleton from CLAUDE.md: `/client`, `/server`, `/shared`, `/db`, `/economy`, `/assets` — but ONLY populate `/client` and `/shared` for now (M0 is local-only; the server comes in M2).
2. Scaffold `/client` with **Vite + TypeScript + Phaser 3** (latest stable). TypeScript strict mode on. Add ESLint + Prettier with sensible defaults. `npm run dev` must serve the game; `npm run build` must produce a clean production build; keep both working at every commit.
3. Create `/shared/palette.ts` exporting the exact hex constants from ART-DIRECTION.md (duskSky #35284F, ink #1E1930, structureMid #4E4560, groundBase #6B5E70, groundAccent #9A8574, warmGlow #FFD9A0, neonAmber #FFB84D, neonRose #FF6F91, neonTeal #2FD3B8, neonCyan #5BC0FF, solarGreen #7BC59A). These are the ONLY colors used anywhere in the game. UI text: near-white with a warm tint.
4. Create `/shared/config.ts` for all game constants (tile size, move speed, gather times, yields, inventory size). **No magic numbers in game logic — everything tunable lives here.**
5. Art — **voxel/chunky-iso style, CC0 assets first.** The target look is chunky voxel-isometric (Kintara-like blocks, warm dusk lighting). Source assets in this order:
   - **Kenney CC0 packs (download from itch.io / kenney.nl):** *Isometric Blocks*, *Isometric Prototype Tiles*, and the *Kenney Game Assets All-in-1* bundle — use these for ground tiles, blocks, crates, and props. If the packs are present in `/assets` use them; if not, note it in PROGRESS.md so the user can download them (kenney-assets.itch.io), and fall back to the next option meanwhile.
   - **Procedural palette placeholders** as the fallback: diamond iso tiles in groundBase with subtle groundAccent variation; obstacles as structureMid voxel-style blocks (top face lighter, side faces darker — fake the voxel shading) with an ink outline and a small neonAmber sign accent; the player as a chunky capsule sprite with a warm rim-light stroke; junk heaps as irregular structureMid mounds with a neonTeal glint (interactable = neon accent, per the readability rule). Drawn once into generated textures at boot, not per-frame.
   - **Tint everything warm:** whatever the source, apply the dusk ambience — never ship the default bright-green/daylight look of stock packs. Custom hero art comes later via MagicaVoxel renders; never use license-restricted packs (e.g. Synty) for anything that could become a minted cosmetic.

## M0 — Prototype (complete ALL of this, in order, one commit each)

- [ ] **M0.1 — Iso grid renders.** A 40×40 isometric tile map (2:1 diamond tiles, e.g. 64×32) drawn from a 2D array in `/shared` (0 = walkable, 1 = blocked). Warm dusk background (duskSky), groundBase tiles with slight per-tile accent variation so the floor isn't flat-looking. Camera starts centered. *Acceptance: page loads, a readable warm iso plaza is visible, 60fps.*
- [ ] **M0.2 — Camera.** Wheel zoom (clamped 0.5×–2×), edge-drag or middle-mouse pan, and camera follow once the player exists. *Acceptance: smooth zoom/pan, no tile seams at any zoom.*
- [ ] **M0.3 — Player + click-to-move with A\*.** A Spark sprite on the grid. Left-click a walkable tile → A* path around blocked tiles → smooth tile-to-tile tween movement with correct depth sorting (player renders behind/in front of obstacles correctly). Click feedback marker at the destination (neonTeal pulse). *Acceptance: clicking anywhere routes correctly around obstacles; no diagonal corner-cutting through blocked tiles; depth sorting never glitches.*
- [ ] **M0.4 — One gatherable: junk heap → Salvage.** Scatter ~15 junk-heap nodes on the map (from config). Click a node → if not adjacent, path to an adjacent tile first → then a gather loop begins: progress indicator above the player, gather time from config, then +1–3 Salvage (yield range from config) enters the inventory, node visually depletes and respawns after a config cooldown. Gathering is a pure function in `/shared` (input: node state + config + RNG seed → output: yield) with unit tests. *Acceptance: full click→walk→gather→loot loop works repeatedly; tests pass.*
- [ ] **M0.5 — Inventory + hotbar.** `I` toggles a warm-styled inventory panel (24 slots, stacks to 999, drag to rearrange). Hotbar keys 1–6 at bottom-center; drag items from inventory to hotbar; active slot highlighted in neonAmber. Salvage stacks correctly. Esc closes the top panel. *Acceptance: gather → see Salvage stack grow → drag to hotbar → select slots with keys; UI colors are palette-only.*
- [ ] **M0.6 — M0 verification pass.** Play the full loop for several minutes; fix anything janky (pathing stutter, depth bugs, UI overlap). Write a short `PROGRESS.md` describing what exists, known issues, and what M1 starts with. Tag the commit `m0-complete`.

## M1 — Single-player loop (continue directly, one commit per checkbox)

- [ ] **M1.1 — All five resources + tools.** Add Brass + Amperite nodes (Drillhammer), Glowkoi spots along a coolant canal strip (Skimnet), and antenna-shrines (Tuner) with a simple frequency-matching minigame (slider/timing bar → Signal yield scales with accuracy). Tools are hotbar items; the active tool determines what you can gather (correct tool required, from config). Riveter exists as an item for later building.
- [ ] **M1.2 — Skills + XP.** Scavving/Delving/Skimming/Tuning/Brawling/Griddling with XP curves from config; level-ups slightly speed gathering (config multipliers). Skills panel UI.
- [ ] **M1.3 — Mobs + Brawling.** Scuttlebots (weak swarmers) and Junkhounds (chunkier) with aggro radius, chase, wind-up telegraphs, and contact damage. Player melee on click with the equipped weapon; player HP bar; death → respawn at the plaza (no item loss yet). Mob AI states: idle/wander/chase/attack/return-home.
- [ ] **M1.4 — Healing.** The Great Dynamo zone at the plaza center (stand near → fast HP regen, warmGlow pulse) and a placeable Heatlamp (consumes materials from config, lasts a config duration, heals nearby).
- [ ] **M1.5 — Crafting + gear tiers + durability.** A Tinkerbench at the plaza: recipes from config combining Bolts + resources into tools/weapons across tiers Tinker → Brassbound → Coilworked (first three tiers only for now). All gear has durability that decrements on use; repair at the Tinkerbench costs Bolts + a little material. Crafting/repair math = pure functions with unit tests.
- [ ] **M1.6 — Bolts + merchant + quests.** Bolts currency; a merchant NPC (buys resources at config prices, sells basic tools/consumables); a simple quest system: 3 tutorial quests (gather Salvage, craft a tool, cook a Koi Skewer at a Griddle stall) + 2 repeatable dailies with Bolts rewards. **Every Bolts movement (earn or spend) is appended to a local ledger log** — the habit that becomes the economy ledger later.
- [ ] **M1.7 — Local save.** Persist inventory, skills, Bolts, quest state, and placed structures to localStorage (schema-versioned JSON with a migration stub). Autosave on change + on unload.
- [ ] **M1.8 — M1 verification pass.** Full loop test: gather all five resources → craft → fight → die → respawn → heal → quest → save/reload. Update `PROGRESS.md`, tag `m1-complete`, and STOP — write a summary of everything built, open questions, and your recommended plan for M2 (Colyseus multiplayer), then wait for my review.

## Rules that override everything else

- **Commit after every checkbox** with messages like `M0.3: A* click-to-move with depth sorting`.
- **No magic numbers** — all tunables in `/shared/config.ts`.
- **Palette-only colors** — import from `/shared/palette.ts`; never hardcode a hex in game code.
- **Pure, tested functions** for anything that computes value (yields, damage, crafting, prices) — Vitest, colocated tests, `npm test` green at every commit.
- **World nouns exactly as in CLAUDE.md** (Bolts, Salvage, Spark, The Filament, etc.) in code identifiers, UI text, and comments.
- **Do not build ahead:** no networking, no wallet code, no server folder contents, no $AMP anything until M2/M3. The soft-currency ledger habit (M1.6) is the only economy groundwork allowed.
- **If something is ambiguous**, choose the simplest option consistent with the bible, note it in the commit message, and keep moving.

Begin now with project setup, then M0.1.

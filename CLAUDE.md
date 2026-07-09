# AMPERIA — CLAUDE.md

Guardrails and build order for Claude Code. Read this before writing code. Keep it updated as the project evolves.

## What we're building

**AMPERIA** — an isometric cozy salvage-punk MMO set in a warm neon market-city built around the Great Dynamo. Sparks (players) scavenge salvage, delve brass/amperite, skim glowkoi, tune signal, fight feral junkbots, craft/upgrade gear, and trade across districts. Two currencies: **Bolts** (soft, in-game) and **$AMP** (hard, Solana/pump.fun, fixed supply). See `AMPERIA-Game-Bible.md` for the world, `ART-DIRECTION.md` for the locked visual spec, and the economy doc for tokenomics.

## Golden rules (do not violate)

1. **The server is authoritative for everything with value.** Gathering results, combat outcomes, inventory, Bolts, and all $AMP are decided server-side. The client sends *intents* ("I want to hit this node") and *renders* results. Never trust client-reported quantities, positions used for loot, or balances.
2. **Secrets stay server-side.** The treasury keypair, RPC keys, and DB creds live only on the server / in env vars — never in client code or the repo. Never log private keys.
3. **$AMP never buys power.** It buys cosmetics, deeds, the season pass, staking perks, convenience, and governance only. Progression power comes from Bolts + resources. This invariant is load-bearing for the whole economy.
4. **Fixed supply is real.** There is no minting. Player $AMP rewards come only from a finite treasury reserve refilled by buyback. Any code path that "grants $AMP" must draw from that reserve with a hard cap — never fabricate tokens.
5. **Bolts is a closed loop.** No code path converts Bolts to $AMP. Bolts may be *destroyed* as a co-payment alongside $AMP on premium goods — never exchanged into it.
6. **Every faucet needs a sink.** When adding a way to earn Bolts/resources, add or point to the matching recurring sink. Log both to the economy ledger.
7. **Respect the locked art direction.** Warm golden-dusk palette (see ART-DIRECTION.md hex table); no grass/fields/ocean terrain; no large pure-black regions; saturated neon reserved for interactables and signage.
8. **Build one milestone checkbox at a time, commit after each.** Small, reviewable commits. Don't scaffold M3 while M1 is unfinished.

## Tech stack

- **Client:** TypeScript + Phaser 3 + Vite. Isometric tilemap. Warm-dusk cozy salvage-punk theme.
- **Realtime server:** Colyseus (TypeScript). One room type per district (The Filament, The Tangle, ...).
- **DB:** PostgreSQL + Prisma. **Cache/presence/rate-limit:** Redis.
- **Wallet/chain:** @solana/wallet-adapter (Sign-In-With-Solana), @solana/web3.js, @solana/spl-token. $AMP = an SPL mint address.
- **Economy service:** separate Node/TS service; holds treasury keypair; verifies on-chain payments; runs buyback-and-burn; claims pump.fun creator fees.

## Repo structure

```
/client        Phaser 3 game (Vite). Rendering + input + UI only.
/server        Colyseus rooms + authoritative game logic.
/shared        Types/schemas shared client<->server (resource ids, item defs, config).
/db            Prisma schema + migrations.
/economy       Treasury + on-chain verification + buyback/burn service.
/assets        CC0 art (Kenney etc.) + palette placeholders during prototype.
CLAUDE.md      This file.
```

## Conventions

- TypeScript strict mode on. No `any` in shared/economy code.
- All game constants (resource yields, gear tiers, costs, XP curves, drop rates, sink prices) live in `/shared` config, not hard-coded in logic — the economy is tuned weekly.
- Server validates every action against these configs. Client uses them only for display/prediction.
- Write the economy ledger (who earned/spent what, when) for every Bolts/resource/$AMP movement. It's the source of truth for the balance dashboard.
- Prefer deterministic, testable pure functions for gathering/combat/economy math so they can be unit-tested off a live server.
- Palette constants from ART-DIRECTION.md live in `/shared/palette.ts` and are the only colors used.

## World nouns (use these exact names)

Currencies: **Bolts** (soft), **$AMP** (hard). Resources: **Salvage, Brass, Amperite, Glowkoi, Signal**. Tools: **Magclaw, Drillhammer, Skimnet, Tuner, Riveter**. Skills: **Brawling, Scavving, Delving, Skimming, Tuning, Griddling**. Player = **Spark**. Districts: **The Filament, The Tangle, Deep Tangle, The Boneyards, The Canals, The Terrarium, The Circuit, Grid A/B**. Heal spots: **The Great Dynamo** (hub), **Heatlamp** (placeable). Bank = **The Ledgerhouse**. Market = **The Nightstalls**. Prize wheel = **The Fortune Coil**. Practice yard = **The Sparyard**. Mine = **The Underworks**. Travel = **Tramgates**. Death drop = **Scrapcache**. Gear tiers: **Tinker → Brassbound → Coilworked → Ampforged → Filament-grade**. Mobs: **Scuttlebots, Junkhounds, Sparkwisps, Draymules, Cranekings**. Mounts: **Zipboard**, tamed **Junkhound**. Structures: **Heatlamp, Loftpod, Auto-claw rig, Antenna mast, Fence panel, Lockbox**. Consumables: **Warmcup, Shinelure, Cellwax, Koi Skewers**. Commands: `/haul /park /latch /unlatch /near /help`.

## Current milestone

> **M0 — Prototype.** Iso tile grid + click-to-move (A*) + one gatherable (junk heap → Salvage) + inventory/hotbar. Local only, no server yet. See `KICKOFF-PROMPT.md` / the bible's M0 checklist. Do these one at a time and commit each.

## Definition of done (per feature)

Server-authoritative (once the server exists) · config-driven (no magic numbers) · ledger-logged if it touches value · unit-tested for the math · palette-compliant · committed with a clear message. If it involves $AMP, it also respects rules 2–5 above.

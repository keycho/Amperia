# AMPERIA — CLAUDE.md

Guardrails and build order for Claude Code. Read this before writing code. Keep it updated as the project evolves. **v2 — aligned with `AMPERIA-GameBible-v2.md` and `AMPERIA-EconomyDesign-v2.md` (these supersede all v1 docs).**

## What we're building

**AMPERIA** — an isometric cozy salvage-punk MMO set in a warm neon market-city built around the Great Dynamo. Sparks (players) scavenge salvage, delve brass/amperite, skim glowkoi, tune signal, fight feral junkbots, craft/upgrade gear, and trade across districts. Two value layers: **Bolts** (soft, off-chain, closed loop) and **$AMP** (hard — a standard **ERC-20 on Robinhood Chain**, an Ethereum L2 fair-launched via **hood.fun**; fixed 1B supply, LP permanently locked, mint renounced). Access is **token-gated**: holding **1,000 $AMP** is the non-custodial membership key (Charged); a **guest/demo** path lets new Sparks try the city first. All chain assumptions live in `/shared/chain.ts`. See the Game Bible v2 for the world, `ART-DIRECTION.md` for the locked visual spec, and the Economy Design v2 for the operating numbers.

## Golden rules (do not violate)

1. **The server is authoritative for everything with value.** Gathering results, combat outcomes, inventory, Bolts, the $AMP token gate, and every premium purchase are decided server-side. The client sends *intents* ("I want to hit this node") and *renders* results. Never trust client-reported quantities, positions used for loot, balances, or wallet state.
2. **Secrets stay server-side.** The treasury **wallet private key**, the Robinhood Chain RPC URL/key, and DB creds live only on the server / in env vars (names in `/shared/chain.ts`, values in `process.env`) — never in client code or the repo. Never log private keys.
3. **$AMP never buys combat/gathering power or market throughput.** It has two roles: **hold ≥ 1,000 $AMP** = the non-custodial membership key (we read your balance via `balanceOf`, never take custody); **spend $AMP** on cosmetics, presence-only deeds, the season pass, non-custodial Charge Locks (status/votes — **no yield, ever**), charters, and vanity. Progression power comes from Bolts + resources. Guest and key-holding Sparks have identical rates, stats, drop tables, and stock slots — the key gates content *breadth* (Mastery 26–50, seasonal quests), never power.
4. **Fixed supply is real.** No minting exists (mint renounced at fair launch). The ONLY codepath that credits $AMP to a player is the **champions'-purse** prize payout, funded by the treasury (and, only if `CREATOR_REWARDS_ENABLED` is ever set, the buyback's purse half) — never by minting, and within its published cap. Never fabricate tokens.
5. **Bolts is a closed loop.** No codepath converts Bolts, resources, or items into $AMP — ever. The token gate is a **read-only, non-custodial** balance check (ERC-20 `balanceOf`); it never takes custody of, moves, or converts anyone's $AMP.
6. **No randomness downstream of a premium payment.** No randomized outcome may follow an $AMP payment anywhere in the product graph (includes membership perks — the monthly cosmetic is published and deterministic). The Fortune Coil: free daily spin + Bolts-paid spins with untradeable, cosmetic-only, non-gameplay-affecting prizes. $AMP never touches the wheel on either side.
7. **Premium items never drop.** Deeds and premium cosmetics never drop on death, never enter Scrapcaches, and are excluded from every loot table. Player-to-player loot transfers (Scrapcache looting) are logged as transfers and count toward trade-anomaly limits.
8. **Treasury $AMP is never sold and never sent to team wallets.** Its only outflows are burns and the champions' purse. Purchases are **$AMP-only**: every spend burns **30% on-chain at the till** (ERC-20 transfer to the dead address) and routes **70% to the treasury wallet** — emitting exactly one burn event + one treasury event, logged on-chain. There is no second payment rail.
9. **Every faucet needs a sink.** When adding a way to earn Bolts/resources, add or point to the matching recurring sink. Circuit purses are entry-fee-funded (rake = sink) — PvP never prints Bolts. Log both sides to the economy ledger.
10. **Respect the locked art direction.** Warm golden-dusk palette (see ART-DIRECTION.md hex table); no grass/fields/ocean terrain; no large pure-black regions; saturated neon reserved for interactables and signage.
11. **Respect the comms rules in code-adjacent copy too** (UI strings, store text, notifications): never "earn," "yield," "APY," "investment," or price talk. Prizes are prizes; membership is membership.
12. **Build one milestone checkbox at a time, commit after each.** Small, reviewable commits. Don't scaffold M3 while M1 is unfinished. **Retention gate: M4 (token utility) does not start until M3's D7/D30 targets are hit with the token switched off.**

## Tech stack

- **Client:** TypeScript + Phaser 3 + Vite. Isometric tilemap. Warm-dusk cozy salvage-punk theme.
- **Realtime server:** Colyseus (TypeScript). One room type per district; horizontal room instances per district under load. One world — no Grid A/B. The Nightstalls market row is single-instance.
- **DB:** PostgreSQL + Prisma. **Cache/presence/rate-limit:** Redis (rate profiles, behavioral-entropy flags).
- **Wallet/chain:** **wagmi + viem** in the browser (**Sign-In-With-Ethereum**, EIP-4361); **viem** for ERC-20 reads/writes server-side. $AMP = an ERC-20 contract address on **Robinhood Chain** (all constants in `/shared/chain.ts`). Access is **token-gated** (hold 1,000 $AMP, checked server-side via `balanceOf`); the **guest/demo** path needs no wallet.
- **Economy service:** separate Node/TS service; holds the treasury **wallet key** (server-side only); verifies $AMP payments and reads wallet balances via **viem** against the Robinhood Chain RPC; every spend burns **30% on-chain** / routes **70% to treasury**; **(flag-gated by `CREATOR_REWARDS_ENABLED`)** runs the monthly buyback from **hood.fun ETH creator rewards**; emits the monthly City Ledger. All chain assumptions come from `/shared/chain.ts`; Economy Design invariants live here as runtime assertions + integration tests.

## Repo structure

```
/client        Phaser 3 game (Vite). Rendering + input + UI only.
/server        Colyseus rooms + authoritative game logic.
/shared        Types/schemas shared client<->server (resource ids, item defs, config).
/db            Prisma schema + migrations.
/economy       Treasury + on-chain verification + buyback/City Ledger service.
/assets        CC0 art (Kenney etc.) + palette placeholders during prototype.
CLAUDE.md      This file.
```

## Conventions

- TypeScript strict mode on. No `any` in shared/economy code.
- All game constants (resource yields, gear tiers, costs, XP curves, drop rates, sink prices, NPC price bands, Charge thresholds, the token-gate threshold) live in `/shared` config (chain assumptions in `/shared/chain.ts`), not hard-coded in logic — the economy is tuned weekly via the pre-committed levers in Economy Design §5.
- Server validates every action against these configs. Client uses them only for display/prediction.
- Write the economy ledger (who earned/spent/traded/looted what, when) for every Bolts/resource/$AMP movement. It's the source of truth for the balance dashboard, the City Ledger, and trade-anomaly detection.
- Prefer deterministic, testable pure functions for gathering/combat/economy math so they can be unit-tested off a live server.
- Gathering minigames need server-side timing validation + behavioral-entropy logging (statistically perfect timing = flag), with per-session cue variation.
- Palette constants from ART-DIRECTION.md live in `/shared/palette.ts` and are the only colors used.

## World nouns (use these exact names)

Value layers: **Bolts** (soft) · **$AMP** (hard — ERC-20 on Robinhood Chain; holding **1,000 $AMP** is the **Charged** membership key). Resources: **Salvage, Brass, Amperite, Glowkoi, Signal**. Tools: **Magclaw, Drillhammer, Skimnet, Tuner, Riveter**. Skills (each with **Mastery 1–50**; 26+ is Charged): **Brawling, Scavving, Delving, Skimming, Tuning, Griddling**; level-50 cosmetic = **Mastercoil sash**. Player = **Spark**. Districts: **The Filament, The Tangle, Deep Tangle, The Boneyards, The Canals, The Terrarium, The Circuit** (one world — no Grid A/B). Heal spots: **The Great Dynamo** (hub; hosts the **Citywide Charge** meter), **Heatlamp** (placeable). Bank = **The Ledgerhouse**. Market = **The Nightstalls** (NPC merchants + player shop stalls; order-book **Exchange** later, population-gated). Premium shop = **Cosmetic Foundry**. Prize wheel = **The Fortune Coil**. Practice yard = **The Sparyard**. Mine = **The Underworks**. Travel = **Tramgates**. Death drop = **Scrapcache**. Collection log = **The Manifest**. Daily bonus = **Rested Charge**. Lock tiers = **Charge Locks (Ember / Arc / Aurora)**. Public report = **the City Ledger**. Gear tiers: **Tinker → Brassbound → Coilworked → Ampforged → Filament-grade**. Mobs: **Scuttlebots, Junkhounds, Sparkwisps, Draymules, Cranekings**. Mounts: **Zipboard**, tamed **Junkhound**. Structures: **Heatlamp, Loftpod, Crew Hall, Auto-claw rig, Antenna mast, Fence panel, Lockbox**. Consumables: **Warmcup, Shinelure, Cellwax, Koi Skewers**. Commands: `/haul /park /latch /unlatch /near /crew /charge /help`.

## Current milestone

> **M0 — Prototype.** Iso tile grid + click-to-move (A*) + one gatherable (junk heap → Salvage, with the glint-spot active layer) + inventory/hotbar. Local only, no server yet. See the Game Bible v2 D2 milestone table. Do these one at a time and commit each.

## Definition of done (per feature)

Server-authoritative (once the server exists) · config-driven (no magic numbers) · ledger-logged if it touches value · unit-tested for the math · palette-compliant · comms-rules-compliant in its UI strings · committed with a clear message. If it involves $AMP, the token gate, or premium purchases, it also respects golden rules 2–8 and the Economy Design §13 invariant list.

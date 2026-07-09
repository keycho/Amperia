# AMPERIA — CLAUDE.md

Guardrails and build order for Claude Code. Read this before writing code. Keep it updated as the project evolves. **v2 — aligned with `AMPERIA-GameBible-v2.md` and `AMPERIA-EconomyDesign-v2.md` (these supersede all v1 docs).**

## What we're building

**AMPERIA** — an isometric cozy salvage-punk MMO set in a warm neon market-city built around the Great Dynamo. Sparks (players) scavenge salvage, delve brass/amperite, skim glowkoi, tune signal, fight feral junkbots, craft/upgrade gear, and trade across districts. Three value layers: **Bolts** (soft, off-chain, closed loop), the **Dynamo Bond** (bridge item → Charged membership), and **$AMP** (hard, Solana/pump.fun, fixed supply). See the Game Bible v2 for the world, `ART-DIRECTION.md` for the locked visual spec, and the Economy Design v2 for the operating numbers.

## Golden rules (do not violate)

1. **The server is authoritative for everything with value.** Gathering results, combat outcomes, inventory, Bolts, Bonds, and all $AMP are decided server-side. The client sends *intents* ("I want to hit this node") and *renders* results. Never trust client-reported quantities, positions used for loot, or balances.
2. **Secrets stay server-side.** The treasury keypair, RPC keys, and DB creds live only on the server / in env vars — never in client code or the repo. Never log private keys.
3. **$AMP never buys combat/gathering power or market throughput.** It buys membership (via Bonds), cosmetics, presence-only deeds, the season pass, non-custodial Charge Locks (status/votes — **no yield, ever**), charters, and vanity. Progression power comes from Bolts + resources. Free and Charged Sparks have identical rates, stats, drop tables, and stock slots — Charged gates content *breadth* (Mastery 26–50, seasonal quests), never power.
4. **Fixed supply is real.** No minting exists. The ONLY codepath that grants $AMP to a player is the prize-reserve payout path, with BOTH caps enforced: reserve balance ≤ 5M $AMP and rolling-year payouts ≤ 10M $AMP. Reserve refill source = buyback transactions only. Never fabricate tokens.
5. **Bolts is a closed loop.** No codepath converts Bolts, resources, or items into $AMP. The Bond bridge is one-way: $AMP/SOL → Bond → (one player trade for Bolts) → membership redemption (destroys the Bond). Bonds are tradeable exactly once and bind on trade.
6. **No randomness downstream of a premium payment.** No randomized outcome may follow an $AMP or SOL payment anywhere in the product graph (includes membership perks — the monthly cosmetic is published and deterministic). The Fortune Coil: free daily spin + Bolts-paid spins with untradeable, cosmetic-only, non-gameplay-affecting prizes. $AMP never touches the wheel on either side.
7. **Premium items never drop.** Bonds, deeds, and premium cosmetics never drop on death, never enter Scrapcaches, and are excluded from every loot table. Player-to-player loot transfers (Scrapcache looting) are logged as transfers and count toward trade-anomaly limits.
8. **Treasury $AMP is never sold and never sent to team wallets.** Its only outflows are burns and prize-reserve refills. Ops run on the SOL rail. Every premium purchase emits exactly one burn event + one treasury event ($AMP rail) or one treasury event (SOL rail), logged on-chain.
9. **Every faucet needs a sink.** When adding a way to earn Bolts/resources, add or point to the matching recurring sink. Circuit purses are entry-fee-funded (rake = sink) — PvP never prints Bolts. Log both sides to the economy ledger.
10. **Respect the locked art direction.** Warm golden-dusk palette (see ART-DIRECTION.md hex table); no grass/fields/ocean terrain; no large pure-black regions; saturated neon reserved for interactables and signage.
11. **Respect the comms rules in code-adjacent copy too** (UI strings, store text, notifications): never "earn," "yield," "APY," "investment," or price talk. Prizes are prizes; membership is membership.
12. **Build one milestone checkbox at a time, commit after each.** Small, reviewable commits. Don't scaffold M3 while M1 is unfinished. **Retention gate: M4 (token utility) does not start until M3's D7/D30 targets are hit with the token switched off.**

## Tech stack

- **Client:** TypeScript + Phaser 3 + Vite. Isometric tilemap. Warm-dusk cozy salvage-punk theme.
- **Realtime server:** Colyseus (TypeScript). One room type per district; horizontal room instances per district under load. One world — no Grid A/B. The Nightstalls market row is single-instance.
- **DB:** PostgreSQL + Prisma. **Cache/presence/rate-limit:** Redis (rate profiles, behavioral-entropy flags).
- **Wallet/chain:** @solana/wallet-adapter (Sign-In-With-Solana), @solana/web3.js, @solana/spl-token. $AMP = an SPL mint address. Wallet linking is optional and late — the full free game requires no wallet (email accounts first).
- **Economy service:** separate Node/TS service; holds treasury keypair; verifies on-chain payments on both rails ($AMP at oracle spot with ~10% discount / SOL); runs the automated randomized-TWAP monthly buyback; claims pump.fun creator fees; emits the monthly City Ledger. All Economy Design §13 invariants live here as runtime assertions + integration tests.

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
- All game constants (resource yields, gear tiers, costs, XP curves, drop rates, sink prices, NPC price bands, Charge thresholds, Bond Board limits) live in `/shared` config, not hard-coded in logic — the economy is tuned weekly via the pre-committed levers in Economy Design §5.
- Server validates every action against these configs. Client uses them only for display/prediction.
- Write the economy ledger (who earned/spent/traded/looted what, when) for every Bolts/resource/Bond/$AMP movement. It's the source of truth for the balance dashboard, the City Ledger, and trade-anomaly detection.
- Prefer deterministic, testable pure functions for gathering/combat/economy math so they can be unit-tested off a live server.
- Gathering minigames need server-side timing validation + behavioral-entropy logging (statistically perfect timing = flag), with per-session cue variation.
- Palette constants from ART-DIRECTION.md live in `/shared/palette.ts` and are the only colors used.

## World nouns (use these exact names)

Value layers: **Bolts** (soft) · **Dynamo Bond** (bridge, redeems to **Charged** membership) · **$AMP** (hard). Resources: **Salvage, Brass, Amperite, Glowkoi, Signal**. Tools: **Magclaw, Drillhammer, Skimnet, Tuner, Riveter**. Skills (each with **Mastery 1–50**; 26+ is Charged): **Brawling, Scavving, Delving, Skimming, Tuning, Griddling**; level-50 cosmetic = **Mastercoil sash**. Player = **Spark**. Districts: **The Filament, The Tangle, Deep Tangle, The Boneyards, The Canals, The Terrarium, The Circuit** (one world — no Grid A/B). Heal spots: **The Great Dynamo** (hub; hosts the **Citywide Charge** meter), **Heatlamp** (placeable). Bank = **The Ledgerhouse**. Market = **The Nightstalls** (NPC merchants + player shop stalls + **Bond Board**; order-book **Exchange** later, population-gated). Premium shop = **Cosmetic Foundry**. Prize wheel = **The Fortune Coil**. Practice yard = **The Sparyard**. Mine = **The Underworks**. Travel = **Tramgates**. Death drop = **Scrapcache**. Collection log = **The Manifest**. Daily bonus = **Rested Charge**. Lock tiers = **Charge Locks (Ember / Arc / Aurora)**. Public report = **the City Ledger**. Gear tiers: **Tinker → Brassbound → Coilworked → Ampforged → Filament-grade**. Mobs: **Scuttlebots, Junkhounds, Sparkwisps, Draymules, Cranekings**. Mounts: **Zipboard**, tamed **Junkhound**. Structures: **Heatlamp, Loftpod, Crew Hall, Auto-claw rig, Antenna mast, Fence panel, Lockbox**. Consumables: **Warmcup, Shinelure, Cellwax, Koi Skewers**. Commands: `/haul /park /latch /unlatch /near /crew /charge /help`.

## Current milestone

> **M0 — Prototype.** Iso tile grid + click-to-move (A*) + one gatherable (junk heap → Salvage, with the glint-spot active layer) + inventory/hotbar. Local only, no server yet. See the Game Bible v2 D2 milestone table. Do these one at a time and commit each.

## Definition of done (per feature)

Server-authoritative (once the server exists) · config-driven (no magic numbers) · ledger-logged if it touches value · unit-tested for the math · palette-compliant · comms-rules-compliant in its UI strings · committed with a clear message. If it involves $AMP, Bonds, or premium purchases, it also respects golden rules 2–8 and the Economy Design §13 invariant list.

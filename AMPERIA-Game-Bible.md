# AMPERIA — Game Bible & Build Plan

*An isometric MMO set in the Empire of Current — a warm, neon-lit market-city built inside the shell of a colossal dead power plant. Scavenge, delve, skim, tune, craft, and trade your way up the stacks. Powered by **$AMP**.*

---

# PART A — BRAND

- **Game name:** AMPERIA
- **Token:** **$AMP** (Solana / pump.fun — fixed supply, mint authority renounced, un-mintable)
- **Tagline:** *"Keep the city lit."*
- **Logline:** Long ago the surface grid died — everywhere except Amperia, the stacked market-city that grew around the **Great Dynamo**, the last machine still humming. Everyone here lives off its warmth. You are a **Spark**: a newcomer scavenger-tinker who keeps the lights on and makes a name (and a fortune) doing it.
- **Player identity:** **Sparks**. Community = "the Sparks." Cosmetic factions = **Crews**.
- **Tone:** hopeful, busy, cozy. A city of tinkers and traders, not a dystopia. Danger exists at the edges (rogue machines in the outskirts), but home is warm.

## Art direction — LOCKED (see ART-DIRECTION.md for full spec)

**"Cozy salvage-punk."** A warm future night-market: perpetual **golden dusk**, string lights, holo-lanterns, noodle stalls, patched chrome, graffiti, barrel gardens. Palette anchored on warm plum/mauve mid-values with neon **amber `#FFB84D` / teal `#2FD3B8` / rose `#FF6F91`** reserved for signage and interactables. **No grass, fields, or ocean** — the ground is decking, plating, pavement, rugs; greenery only as planters and hanging vines. No large pure-black regions (deepest tone: plum `#35284F`). Verticality is faked with a parallax backdrop and edge-sprites; the walkable plane stays flat and readable. Built to be pleasant for daily hour-long sessions.

---

# PART B — WORLD BIBLE

## B1. The two currencies

| | **Bolts** (soft) | **$AMP** (hard) |
|---|---|---|
| What it is | In-game money — named for the salvaged bolts once used as coins | The on-chain token; scarce, fixed 1B supply |
| Earn | Play: scav, delve, skim, tune, fight, quest | **Buy on market**; small prestige rewards from a buyback-fed reserve |
| Buys | Gear tiers, repairs, upkeep, consumables, market trades | Cosmetics, deeds, season pass, staking, governance — **never power** |
| Design goal | Closed loop, inflation ≈ 0 via recurring sinks | Buy pressure + burn against fixed supply |

## B2. Districts (the realms)

Each district is its own instanced map. Travel = step onto **Tramgate** platforms at map edges (cable-tram, no loading screen). Players in different districts can't see each other.

| District | Role | PvP | Notes |
|---|---|---|---|
| **The Filament** | Hub — spawn, bank, market, healing, tutorial | Off | The glowing heart of Amperia, wrapped around the Great Dynamo |
| **The Tangle** | Wire-maze outskirts; loot drops on death | On (outside camp) | Southern **Lamplight Camp** is the safe zone |
| **Deep Tangle** | Deeper outskirts; level-gated vault **The Fusebox** at the far edge | On (full) | Fewer mobs, higher stakes |
| **The Boneyards** | Vast open scrapyard flats; rogue machines roam | On (full) | Reachable from The Tangle or The Canals |
| **The Canals** | Calm coolant-canal district; skimming + the **Griddle** cooking stall | Off | Only place Griddling XP counts |
| **The Terrarium** | Peaceful hanging-garden tier; the **only** place to place your one Loftpod | Off | Greenery-as-decor district; scav in peace |
| **The Circuit** | Arena — PvP scene with conveyor-rollers that shove you, neon crowd tiers | On (full) | Entered from the Filament's fight docks |
| **Grid A / Grid B** | Two world instances, shared inventory, separate players | — | Keep *earn* progress per-grid (anti-bot) |

## B3. Resources, tools & skills

| Resource | Source | Tool | Skill |
|---|---|---|---|
| **Salvage** | Junk heaps & derelict machines | **Magclaw** (magnetic grabber) | **Scavving** |
| **Brass** | Ore seams (Underworks + outskirt rocks) | **Drillhammer** | **Delving** |
| **Amperite** | Glowing charge-crystal nodes (the power/fuel resource) | **Drillhammer** | **Delving** |
| **Glowkoi** | Luminous fish in the coolant canals | **Skimnet** | **Skimming** |
| **Signal** | Old antenna-shrines & terminals — short tuning minigame | **Tuner** (radio deck) | **Tuning** |
| *(build/place)* | places structures | **Riveter** | — |

**Tuning is the signature mechanic:** a quick frequency-matching minigame at antenna-shrines that yields **Signal** — the "data" resource that feeds crafting and upgrades. Combat skill = **Brawling**. Cooking skill = **Griddling** (at the Canals' Griddle).

## B4. Crafting, gear & consumables

- **Gear tiers** (Bolts + resources, never $AMP): **Tinker → Brassbound → Coilworked → Ampforged → Filament-grade**. Higher tiers gather faster / hit harder. No pay-to-win, ever.
- **Durability + repair** at **the Tinkerbench** — the recurring Bolts sink.
- **Consumables:** **Warmcup** (healing hot drink), **Shinelure** (skimming bait), **Cellwax** (Heatlamp fuel), **Koi Skewers** (cooked Glowkoi — healing food).

## B5. Structures

| Structure | Purpose | Notes |
|---|---|---|
| **Heatlamp** | Short-lived heal spot; stand near it | Consumable (Brass + Amperite + Salvage); the cozy campfire |
| **Loftpod** | Personal landmark pod | One per player, **Terrarium only**; `/haul` to move |
| **Auto-claw rig** | Passive Salvage trickle | Requires upkeep (sink) |
| **Antenna mast** | Passive Signal trickle | Requires upkeep (sink) |
| **Fence panel / Lockbox** | Decor / small stash | Upkeep |

## B6. Mobs & mounts

Friendly-scrappy machines gone feral — mischievous, not horrifying (per art direction):

- **Scuttlebots** (swarmers) · **Junkhounds** (chunky dog-bots) · **Sparkwisps** (floating charge-critters that zap) · **Draymules** (rogue cargo bots) · **Cranekings** (apex rogue crane-bots, Deep Tangle).
- Mobs occasionally drop **mounts**: **Zipboards** (hover-boards) and tamed **Junkhounds**. They do **not** drop Bolts or loot piles — keeps the faucet clean.

## B7. Filament landmarks

- **The Great Dynamo** — the humming heart of the city; stand near it to recharge (heal). The visual centerpiece.
- **The Ledgerhouse** — 48-slot bank; usable only inside the building.
- **The Nightstalls** — marketplace building landmark; the market UI opens from the HUD anywhere.
- **The Fortune Coil** — prize wheel near the stalls: one free spin daily + paid $AMP spins (verified on-chain, 50% burn / 50% treasury).
- **The Sparyard** — safe sparring yard to learn Brawling before the outskirts.
- **The Underworks** — interior delving zone (Brass + Amperite).
- **Tramgates** — cable-tram platforms at the district edges.

## B8. Death & risk

Dangerous districts (Tangle, Deep Tangle, Boneyards) drop some inventory into a **Scrapcache** on death — return quickly to reclaim it. Safe districts never drop. Travel light until you know an area; bank at the Ledgerhouse before long runs.

## B9. Slash commands

`/haul` (pick up your structure) · `/park` (dismount) · `/latch` & `/unlatch` (lock structures) · `/near` (nearby Sparks) · `/help`.

---

# PART C — THE $AMP ECONOMY (flywheel summary)

*Full reasoning in the companion economy doc; these are the operating rules.*

**The constraint:** $AMP is a pump.fun token — fixed supply, no minting. Value accrues only through **buy pressure, burns, staking locks, and buybacks**. No reward is ever printed.

**The flywheel:** free-to-start game → players want the ownership/status layer → they **buy $AMP** → spending **burns** a slice (supply ↓) + funds the **treasury** → treasury (pump.fun SOL creator fees + premium sales) runs **buyback-and-burn** and refills a **finite prestige-reward reserve** → visible burns + a growing game attract holders who recruit players → repeat.

**Operating rules:**

1. **Free-to-start.** No token requirement to play. $AMP gates the premium layer (cosmetic mints, deeds, season pass, staking, governance, prestige-reward eligibility) — never the game, never power.
2. **Bolts is a closed loop.** No open Bolts→$AMP exchange, ever. Bolts touch $AMP only as a *co-payment* on premium goods (the Bolts half is destroyed, the $AMP half is burned/treasuried).
3. **Every $AMP spend burns.** Cosmetic mints, deeds, boosts, paid Fortune Coil spins: fixed burn share + treasury share, logged on-chain and published.
4. **Player $AMP earnings are a trickle, not a faucet.** Season champions, tournament wins, rare achievements only — paid from a hard-capped reserve refilled exclusively by treasury buybacks. Never emission, never farmable.
5. **Every faucet needs a sink.** Bolts sinks are recurring by design: durability/repair, gear tiers, structure upkeep, tram tolls, bank-slot expansion, consumables, crafting fees, market listing fee, death retrieval fee.
6. **Diminishing returns daily** per activity; shared reward pools per district; dynamic merchant pricing; new-wallet rate limits; staking/proof-of-humanity gate on reward eligibility (anti-Sybil).
7. **Instrument everything:** faucet vs. sink totals, median player Bolts, resource price index, $AMP burned/staked/treasury, retention funnel. Tune weekly.

---

# PART D — BUILD PLAN

## D1. Tech stack

- **Client:** TypeScript + Phaser 3 + Vite. Isometric tilemap, warm-dusk theme per ART-DIRECTION.md.
- **Realtime server:** Colyseus (TypeScript) — one room type per district.
- **DB:** PostgreSQL + Prisma. **Cache/presence/rate-limits:** Redis.
- **Wallet/chain:** @solana/wallet-adapter (Sign-In-With-Solana), @solana/web3.js, @solana/spl-token. $AMP = an SPL mint address.
- **Economy service:** separate Node/TS service holding the treasury keypair; verifies on-chain payments; runs buyback-and-burn; claims pump.fun creator fees. Server-side only.
- **Hosting:** client → Vercel/Netlify · Colyseus → Fly.io/Railway · Postgres → Neon/Supabase · Redis → Upstash.

**Golden architecture rule:** the server is authoritative for everything with value. The client renders and sends intents. Never trust the client.

## D2. Milestones & realistic timeline

| Milestone | Contents | Time |
|---|---|---|
| **M0 — Prototype** | Iso grid, click-to-move (A*), one gatherable (junk heap → Salvage), inventory/hotbar | 3–7 days |
| **M1 — Single-player loop** | All 5 resources/tools/skills (incl. Tuning minigame), mobs + Brawling, healing, crafting + tiers + durability, Bolts + merchants + quests, local save | 1–3 weeks |
| **M2 — Multiplayer** | Colyseus districts, sync, SIWS accounts, Postgres persistence, server-authoritative everything, chat, Tramgates | 1–3 months |
| **M3 — Economy + $AMP** | Nightstalls market, $AMP balance + premium gating, on-chain paid spins, treasury + buyback/burn, cosmetic mints, invariants | 3–6 weeks |
| **M4 — Harden & tune** | Anti-cheat, Sybil limits, Scrapcaches, economy dashboard, polish, load tests | ongoing |

*M0–M1 fly. M2–M3 (netcode + on-chain money) are the real project — budget time and hosting there.*

## D3. Asset plan

Prototype 100% on **Kenney CC0** (Isometric Blocks / Prototype Tiles / All-in-1) + flat-color placeholder tiles using the locked palette, so art never blocks progress. Custom look later: render Sparks, junkbots, and stalls in **MagicaVoxel** (free) at the iso angle with emissive neon — unique art, zero license risk for the NFT cosmetics (avoid Synty/EULA-restricted packs for anything minted).

## D4. Repo structure

```
/client        Phaser 3 game (Vite). Rendering + input + UI only.
/server        Colyseus rooms + authoritative game logic.
/shared        Types/schemas/config shared client<->server.
/db            Prisma schema + migrations.
/economy       Treasury + on-chain verification + buyback/burn service.
/assets        CC0 placeholder art during prototype.
CLAUDE.md      Guardrails for Claude Code.
```

---

*Companion files: `ART-DIRECTION.md` (locked), the economy design doc, `CLAUDE.md` (repo guardrails), `KICKOFF-PROMPT.md` (paste into Claude Code to begin).*

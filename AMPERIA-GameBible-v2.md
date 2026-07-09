# AMPERIA — Game Bible & Build Plan (v2)

*An isometric MMO set in the Empire of Current — a warm, neon-lit market-city built inside the shell of a colossal dead power plant. Scavenge, delve, skim, tune, craft, and trade your way up the stacks. Powered by **$AMP**.*

> **v2 revision note:** This version was rewritten after a research pass over every major token-game economy of 2021–2026 — the collapses (Axie, StepN, Pegaxy, Crabada), the survivors (Off The Grid/GUNZ, Pixels post-pivot, MapleStory N, Parallel), the traditional models they all converged on (OSRS Bonds, EVE PLEX), and the mid-2026 US regulatory picture — followed by an **adversarial red-team pass** that traced every value flow for exploits and contradictions. Locked constraints respected throughout: **$AMP is a pump.fun SPL token, fixed 1B supply, mint renounced — no emission is possible, ever.** Everything else was open to change, and much of it changed. **PART E** is the full changelog with reasoning and sources.

---

# PART A — BRAND

- **Game name:** AMPERIA
- **Token:** **$AMP** (Solana / pump.fun — fixed supply, mint authority renounced, un-mintable)
- **Tagline:** *"Keep the city lit."*
- **Logline:** Long ago the surface grid died — everywhere except Amperia, the stacked market-city that grew around the **Great Dynamo**, the last machine still humming. Everyone here lives off its warmth. You are a **Spark**: a newcomer scavenger-tinker who keeps the lights on and makes a name (and a fortune) doing it.
- **Player identity:** **Sparks**. Community = "the Sparks." Player groups = **Crews** (now mechanical, not just cosmetic — see B10).
- **Tone:** hopeful, busy, cozy. A city of tinkers and traders, not a dystopia. Danger exists at the edges (rogue machines in the outskirts), but home is warm.
- **Positioning (one sentence):** *A cozy grind MMO that is fun with the token switched off — where $AMP buys identity, status, membership, and ownership in a city worth belonging to, and never buys combat or gathering power.*

## Communications rules — LOCKED (legal)

These are brand rules because the words used to sell the game are the single biggest legal variable (Howey's "expectation of profit" prong) and the biggest economic variable (extraction-minded players destroyed every P2E economy).

1. **Never use:** "earn," "play-to-earn," "yield," "APY," "passive income," "investment," "price," "moon," or any forward-looking statement about $AMP's value.
2. **Always frame $AMP as:** membership, identity, status, collecting, and city ownership. "Play-and-own," never "play-to-earn."
3. **Never promise buybacks or burns as price support.** Treasury policy is published as fixed, programmatic, backward-looking reporting ("last month the city burned X"), never as a forward promise.
4. Seasonal prize payouts are **prizes for competitive achievement** (like an esports purse), never wages, never "earnings."
5. **Treasury $AMP is never sold on the open market.** Operations are funded from the SOL revenue rail (C4). This is published policy — issuer selling is both a Howey aggravator and a community-trust killer.

## Art direction — LOCKED (see ART-DIRECTION.md for full spec)

**"Cozy salvage-punk."** A warm future night-market: perpetual **golden dusk**, string lights, holo-lanterns, noodle stalls, patched chrome, graffiti, barrel gardens. Palette anchored on warm plum/mauve mid-values with neon **amber `#FFB84D` / teal `#2FD3B8` / rose `#FF6F91`** reserved for signage and interactables. **No grass, fields, or ocean** — the ground is decking, plating, pavement, rugs; greenery only as planters and hanging vines. No large pure-black regions (deepest tone: plum `#35284F`). Verticality is faked with a parallax backdrop and edge-sprites; the walkable plane stays flat and readable. Built to be pleasant for daily hour-long sessions.

---

# PART B — WORLD BIBLE

## B1. The three value layers

v1 had two currencies. v2 has two currencies **plus one bridge item** — the pattern every surviving token game converged on (OSRS Bonds, EVE PLEX, Pixels vPIXEL).

| | **Bolts** (soft) | **Dynamo Bond** (bridge item) | **$AMP** (hard) |
|---|---|---|---|
| What it is | In-game money — named for the salvaged bolts once used as coins. **Off-chain only, never tokenized.** | An in-game item: a sealed charge-cell writ, redeemable for **14 days of Charged membership** | The on-chain token; scarce, fixed 1B supply |
| How you get it | Play: scav, delve, skim, tune, fight, quest | **Buy from the city** ($AMP or SOL — C4), or **buy from another player for Bolts** on the city-run Bond Board | **Buy on market**; small seasonal prizes from a buyback-fed reserve |
| What it buys | Gear tiers, repairs, upkeep, consumables, player-market trades, Bonds from other players | Redeems to membership; tradeable **once** — binds after first trade (unbinding costs a steep Bolts fee = extra sink) | Bonds, cosmetics, deeds, season pass, Charge Locks, crew charters, vanity registry — **never combat or gathering power** |
| Design goal | Closed loop, inflation ≈ 0 via recurring sinks | Sanctioned RMT bridge: cash players fund grinders' membership; grinders' Bolts demand gives cash players liquidity. **No sanctioned path Bolts→$AMP.** | Recurring buy pressure + burn against fixed supply |

**Why the Bond is the keystone.** It converts the game's *fun* into *recurring premium demand*: every dedicated free player who grinds Bolts to buy a Bond is indirectly consuming a premium purchase someone made with $AMP or SOL. It monetizes players who never open a wallet, and it gives gold-farmers' would-be customers a sanctioned alternative. The Bolts→Bond→membership path is a dead end into gameplay — there is no sanctioned way to turn Bolts back into $AMP.

**Honesty clause (red-team).** "No sanctioned path" is not "no path": since $AMP is freely transferable on-chain and Bolts are tradeable in-game, players *can* settle Bolts↔$AMP over-the-counter, and the Bond's Bolts price gives that grey market a reference rate. OSRS Bonds didn't eliminate gold RMT; they collapsed its demand. AMPERIA designs for the residual: lopsided-trade anomaly detection, trade-value caps on young accounts, an explicit ban policy, and — the real lever — faucet tuning that keeps Bolts/hour of botting worth less in fiat than bot operating costs (C7).

**Charged membership** (what a Bond redeems into) gates **content breadth, never combat/gathering power**. Gathering rates, combat stats, drop tables, and market access are identical for free and Charged Sparks. Free Sparks get the complete core game: all districts, all skills to **Mastery 25**, the main quest line, Loftpod tiers 1–3, the full market. Charged adds: **Mastery 26–50** (the long-horizon prestige half of every skill track), seasonal quest lines, additional Manifest pages, Loftpod tiers 4–5, +2 bank tabs, +2 cosmetic loadout slots, Charged name-glow, and a **published** (deterministic — never randomized) monthly cosmetic. This is the OSRS free/member split: the free game is a real game; membership is the aspirational second half — which is exactly what makes a grinder willing to farm Bolts for a Bond, and therefore what makes the whole bridge spin.

## B2. Districts (the realms)

Each district is its own instanced map. Travel = step onto **Tramgate** platforms at map edges (cable-tram, no loading screen). Players in different districts can't see each other.

| District | Role | PvP | Notes |
|---|---|---|---|
| **The Filament** | Hub — spawn, bank, market, healing, tutorial | Off | The glowing heart of Amperia, wrapped around the Great Dynamo |
| **The Tangle** | Wire-maze outskirts; death spills carried resources | On (outside camp) | Southern **Lamplight Camp** is the safe zone |
| **Deep Tangle** | Deeper outskirts; level-gated vault **The Fusebox** at the far edge | On (full) | Fewer mobs, higher stakes; best Amperite density |
| **The Boneyards** | Vast open scrapyard flats; rogue machines roam | On (full) | Reachable from The Tangle or The Canals |
| **The Canals** | Calm coolant-canal district; skimming + the **Griddle** cooking stall | Off | Only place Griddling XP counts |
| **The Terrarium** | Peaceful hanging-garden tier; Loftpods + **Crew Halls** | Off | Greenery-as-decor district; scav in peace |
| **The Circuit** | Arena — PvP scene with conveyor-rollers that shove you, neon crowd tiers | On (full) | Entered from the Filament's fight docks; home of the seasonal ladder |

**Change from v1:** the **Grid A / Grid B split is gone.** One world, one economy, one population. Instanced district rooms already scale horizontally (spin up parallel room instances per district when crowded), and a small MMO's scarcest resource is *density* — of people, of market liquidity, of crew recruits. Splitting it doubled the dead-market risk for zero real anti-bot value; Sybil defense moved to the account layer (C7). **Exception:** the Nightstalls market row is a single non-instanced sub-zone, so shopfront scarcity and foot traffic are real (B8).

**Risk/reward parity rule:** PvP districts pay better *loot*, never better *Bolts-per-hour from the same activity*. A pure gatherer can reach every resource type in a PvE-safe district at reduced density (e.g., Amperite seams exist in the Underworks, just sparser than Deep Tangle). Risk is opt-in spice, not a toll on the cozy audience the art direction targets.

## B3. Resources, tools & skills — now with Mastery

| Resource | Source | Tool | Skill | Active layer (new) |
|---|---|---|---|---|
| **Salvage** | Junk heaps & derelict machines | **Magclaw** (magnetic grabber) | **Scavving** | Heaps expose brief *glint spots*; grabbing on the glint yields bonus + rare-find rolls |
| **Brass** | Ore seams (Underworks + outskirt rocks) | **Drillhammer** | **Delving** | Seams fork; reading *spark-trails* and following the live fork extends the vein |
| **Amperite** | Glowing charge-crystal nodes | **Drillhammer** | **Delving** | Crystals pulse; striking on-pulse avoids shattering the lattice (yield loss) |
| **Glowkoi** | Luminous fish in the coolant canals | **Skimnet** | **Skimming** | Cast-and-tension minigame; koi shadows telegraph size/rarity before the cast |
| **Signal** | Old antenna-shrines & terminals | **Tuner** (radio deck) | **Tuning** | The signature frequency-matching minigame (unchanged, still the flagship) |
| *(build/place)* | places structures | **Riveter** | — | — |

**Why the active layers:** in v1, four of five gathering loops were "click node, wait" — a zero-decision idle pattern humans burn out on. Every skill now has a light attention layer that makes engaged play visibly better (~20–30% + all rare-find rolls) while staying relaxing — rhythm nudges, not twitch tests. Anti-bot honesty (red-team): timing cues raise the *scripting cost floor*, not the ceiling — a written script beats a human at rhythm games. The real bot defense is server-side: behavioral-entropy checks (humans are inconsistently imperfect; statistically perfect timing gets flagged), per-session variation in cue patterns, and the economic lever in C7.

**Skill Mastery (new).** Every skill (Scavving, Delving, Skimming, Tuning, Brawling, Griddling) has a **1–50 Mastery track** on an OSRS-style curve: early levels come in a session, late levels are long-horizon goals. Free accounts progress to 25; Charged unlocks 26–50 (B1). Milestones unlock *breadth, not raw power*: new node types, new recipes, tool cosmetic evolutions, and at 50 an untradeable **Mastercoil sash** (per-skill prestige cosmetic) plus the right to buy the district's mastery banner for your Loftpod or Crew Hall. Number-go-up per skill + visible endgame regalia is the retention spine of every long-lived grind game; v1 had skills but no ladder inside them.

**The Manifest (new).** An account-wide collection log: every rare variant (Gilded Scrap, Blue-Hot Brass, Prismatic Glowkoi, Ghost Frequencies, mob trophies) gets a checkbox. Manifest completion tiers award titles and Loftpod trophies — all untradeable. Cheap to build, enormous long-tail retention.

## B4. Crafting, gear & consumables

- **Gear tiers** (Bolts + resources, never $AMP): **Tinker → Brassbound → Coilworked → Ampforged → Filament-grade**. Higher tiers gather faster / hit harder. Combat and gathering power is never purchasable with $AMP.
- **Durability + repair** at **the Tinkerbench** — the primary recurring Bolts sink. Filament-grade gear is deliberately maintenance-hungry (endgame wealth needs an endgame drain).
- **Consumables:** **Warmcup** (healing hot drink), **Shinelure** (skimming bait), **Cellwax** (Heatlamp fuel), **Koi Skewers** (cooked Glowkoi — healing food).
- **Cosmetic crafting (new):** high-Mastery crafters can craft *dye kits and pattern stencils* (Bolts + rare resources) that re-color **non-premium** gear. Premium $AMP cosmetics remain exclusive; crafted cosmetics give free players an identity ladder and one more resource sink.

## B5. Structures

| Structure | Purpose | Notes |
|---|---|---|
| **Heatlamp** | Short-lived heal spot; stand near it | Consumable (Brass + Amperite + Salvage); the cozy campfire |
| **Loftpod** | Personal landmark pod | One per player, **Terrarium only**; `/haul` to move; upgradeable in tiers (big Bolts/resource sink); displays Manifest trophies & Mastery banners |
| **Crew Hall (new)** | Shared crew lodge, Terrarium | Built and upgraded by crew projects (B10) — the largest Bolts/resource sink in the game |
| **Auto-claw rig** | Passive Salvage trickle | Upkeep sink; **output scales with the owner's active play that day** — an idle account's rig nets ≈ 0 after upkeep (passive faucets on parked alts are bot food; Crabada's idle loop died of this) |
| **Antenna mast** | Passive Signal trickle | Same upkeep + active-owner rule |
| **Fence panel / Lockbox** | Decor / small stash | Upkeep |

## B6. Mobs & mounts

Friendly-scrappy machines gone feral — mischievous, not horrifying (per art direction):

- **Scuttlebots** (swarmers) · **Junkhounds** (chunky dog-bots) · **Sparkwisps** (floating charge-critters that zap) · **Draymules** (rogue cargo bots) · **Cranekings** (apex rogue crane-bots, Deep Tangle).
- Mobs occasionally drop **mounts**: **Zipboards** (hover-boards) and tamed **Junkhounds**. They do **not** drop Bolts or loot piles — keeps the faucet clean. Rare mob trophy drops feed the Manifest.

## B7. Filament landmarks

- **The Great Dynamo** — the humming heart of the city; stand near it to recharge (heal). Home of the **Citywide Charge** (B9).
- **The Ledgerhouse** — 48-slot bank; usable only inside the building. Expansion slots cost Bolts (sink).
- **The Nightstalls** — the market row (see B8), including the **Bond Board**.
- **The Fortune Coil** — prize wheel: **one free spin daily** (the login ritual; can include consumables) + optional **Bolts-paid spins** whose prize pool is **cosmetic shards and Manifest fillers only — nothing that affects gameplay, nothing tradeable**, with duplicate-protection pity. **$AMP never touches the wheel** — no token-paid spins, no token prizes, no tradeable prizes. (Chance + consideration + a thing of value is the structure state gambling regulators are dismantling in 2025–26; even indirect consideration and gameplay-extending prizes have been enough in *Kater*-style jurisdictions, hence the cosmetic-only paid pool. See PART E, change #6.)
- **The Sparyard** — safe sparring yard to learn Brawling before the outskirts.
- **The Underworks** — interior delving zone (Brass + Amperite, PvE-safe reduced density).
- **Tramgates** — cable-tram platforms at the district edges.

## B8. The Nightstalls — markets built for a small population

A pure order-book auction house dies below a critical mass of traders (no sellers → no buyers → exit spiral). The Nightstalls therefore layer market systems, activating as population grows. The Nightstalls row itself is a **single non-instanced sub-zone** — one shared market street, so shopfront scarcity and foot traffic are real.

1. **NPC merchants (launch, always on):** buy resources and sell staples at **dynamic prices inside a published floor/ceiling band** — the market-maker of last resort. Dynamic pricing is also the Bolts-faucet throttle: when a resource floods in, its NPC price slides down the band. Per-account NPC sale volume is capped for young accounts (C7). This makes the game fully playable solo-economy on day one.
2. **Player shops (launch):** deed-holding players stock **asynchronous shop stalls** — browsable while the owner is offline. Asynchronous shops beat order books at low population and make the market a *place* you walk through (cozy night-market fantasy = the economy's own art direction). **Stock slots are identical for every shop** — deeds buy presence, not throughput (see below).
3. **The Bond Board (launch, with the premium layer):** a dedicated city-run board for Dynamo Bonds only — posted bid/ask, full public price history, **per-account purchase limits** (anti-cornering). The Bond is the keystone item; its market cannot wait for order-book population thresholds, and its price is the game's true internal exchange rate (C8 watches it).
4. **The Exchange board (later, population-gated):** a general order-book with a **2% transaction tax (Bolts sink)**, switched on when concurrent actives clear the liquidity threshold (~2–3k CCU). Listing fees apply from day one.

**Stall Deeds ($AMP/SOL, limited, seasonal):** a fixed, small number of Nightstalls shopfronts are leased per season by **sealed-bid auction** (incumbents may retain by matching the winning bid). Deeds are **non-tradeable** and grant *presence*: a physical shopfront on the market street, shop cosmetics and signage, and a Nightstalls directory listing. They do **not** grant extra stock slots, better prices, lower fees, or exclusive goods — sellers without deeds always have the Exchange, NPC merchants, and general listing access. (Red-team: deeds that increase market throughput are purchasable economic power and a de-facto yield asset — both a fairness break and a Howey gift. Presence-only deeds keep the ownership fantasy without the yield.)

## B9. The Citywide Charge — "keep the city lit," literally

The tagline becomes the core communal mechanic. The Great Dynamo consumes **Amperite** — Sparks feed it directly (donation NPC at the Dynamo, or via crew pledges). A city-wide meter fills weekly:

- **Tier thresholds light the city up** — literally: more string lights, brighter districts, and unlock **weekend city buffs** (bonus gathering XP, discounted tram tolls, double Fortune Coil free spins). Buffs are celebratory, modest, and shared by everyone.
- Top individual and crew contributors each week get **untradeable** cosmetic sparks (name-glow trims, Manifest entries) and leaderboard placement. **Charge ladders never pay $AMP** — contribution is purchasable with Bolts, and anything purchasable must never lead to token prizes (C5).
- Economically: the Charge is a **massive, elastic, recurring resource sink** — a pure drain whose thresholds index to active-player counts, so it scales automatically. Thematically: it *is* the game's promise — everyone keeping the city lit together.

## B10. Crews — from cosmetic to structural

- **Crew Charter:** founding a crew costs $AMP (small, one-time — standard burn/treasury split). Vanity crest registry included.
- **Crew Hall:** built in the Terrarium via **crew projects** — collective construction orders demanding huge batches of Salvage/Brass/Signal plus Bolts fees. Halls unlock cosmetic interiors, a crew Heatlamp, trophy walls, and crew banners. Crew projects are the game's largest coordinated sink and its strongest social-commitment mechanic (people stay for the crew, not the grind).
- **Crew ladders:** seasonal leaderboards — Citywide Charge contribution, Circuit tournament results, Manifest completion. Rewards: untradeable regalia and trophies. **$AMP prizes are reserved exclusively for the refereed Circuit finals bracket** (C5) — never for contribution ladders, which are purchasable/Sybil-able by construction.

## B11. Seasons & the goal structure

- **Seasons run ~10–12 weeks.** Each brings a themed cosmetic line, a Circuit tournament ladder, crew ladder resets, one new Manifest page, and one world event. Seasons rotate *goals*, not *power* — no gear resets, ever.
- **Season Pass ($AMP/SOL):** cosmetic-only track, sold separately (Charged membership does **not** include it — membership is content breadth, the pass is the season's cosmetic line; no double-speak between the two). **Non-expiring** — a purchased pass keeps progressing after the season ends (the post-FOMO industry standard; "cozy" and "FOMO" don't mix).
- **Weekly goals, not daily chores:** the retention cadence is a *weekly* goal board (pick 5 of 8) plus a **Rested Charge** bonus (first ~40 min of gathering each day yields +25%). One free Fortune Coil spin is the only daily ritual. Missing a day never breaks anything — no streaks, no punishment.
- **Long-horizon goals:** Mastery 50s, Manifest completion, Filament-grade gear, Crew Hall tiers, Loftpod max-out. The OSRS lesson: players stay for self-set long goals with visible progress, not for developer-pushed daily checklists.

## B12. Death & risk

In dangerous districts (Tangle, Deep Tangle, Boneyards), death spills **carried resources and Bolts** into a **Scrapcache**: the killer (or any passerby) may loot it for the first 60 seconds, after which only the owner can reclaim it, paying a small Bolts **retrieval fee** (sink). Safe districts never drop anything. **Bonds, deeds, premium cosmetics, and equipped gear never drop and never enter Scrapcaches** (C6 invariant — death-loot is otherwise an untracked wealth-transfer channel for RMT and throttle evasion; player-to-player loot events are logged and count toward trade-anomaly limits). Travel light until you know an area; bank at the Ledgerhouse before long runs.

## B13. Slash commands

`/haul` (pick up your structure) · `/park` (dismount) · `/latch` & `/unlatch` (lock structures) · `/near` (nearby Sparks) · `/crew` (crew panel) · `/charge` (Citywide Charge status) · `/help`.

---

# PART C — THE $AMP ECONOMY

**The constraint (locked):** $AMP is a pump.fun token — fixed 1B supply, mint renounced. No reward can ever be printed. Value accrues only through buy pressure, burns, locks, and buybacks against fixed supply.

**The prime directive (new, from the research):** *the game must be a game people would play with the token switched off.* Every economy that inverted this — where the token was the reason to play — died the same death regardless of sink design (Axie, StepN, Pegaxy, Crabada). Every economy still standing in 2026 sells **identity, status, and ownership on top of a game that already retains**. $AMP is AMPERIA's premium layer, not its paycheck.

## C1. The flywheel (v2)

```
            fun, free-to-start game (retention first)
                            │
         players sink hours → want identity, status,
            membership & ownership in the city
                            │
              premium purchases, two rails:
        ┌───────────────────┴───────────────────┐
   $AMP rail (≈10% discount)                SOL rail
   → 30% BURNED (supply ↓)             → 100% treasury SOL
   → 70% treasury $AMP                        │
     (held or re-used for prizes;             ├─→ ops & payroll
      NEVER sold on market)                   │   (the studio lives here)
                            ┌─────────────────┤
                            │      50% of net SOL revenue
                            │      + pump.fun creator fees (bonus)
                            │                 │
                            │     programmatic buyback (TWAP)
                            │        │              │
                            │     half BURNED   half → PRIZE RESERVE
                            │                    (hard-capped)
                            │                        │
                            │      seasonal prizes → refereed champions
                            │                        │
   grinders buy Bonds from cash players with Bolts   │
   → cash players get liquidity → membership         │
     demand recurs every 14 days ─────────► $AMP buy pressure
```

The **demand loop** is powered by the game being worth belonging to. The **supply loop** only ever burns, locks, or holds — treasury $AMP is never market-sold (Comms rule 5). The studio's survival is decoupled from token volume: **ops run on the SOL rail**, so the design stays coherent even if $AMP trading volume decays to zero (pump.fun volume decays to near zero for almost all tokens within weeks — creator fees are a bonus input, never a pillar). The ~10% $AMP-rail discount keeps organic token demand flowing from players who want the better price.

## C2. What $AMP buys (the demand stack)

All premium products are **priced in USD terms** and payable on either rail: $AMP at oracle spot (variable token amount, ≈10% discount, 30% burn / 70% treasury) or SOL (100% treasury). USD pricing is the volatility shield (red-team): a 10x or a −90% in $AMP changes the token amount per Bond, never the fiat price of membership — so product demand and treasury revenue survive both directions, and Bond Bolts-prices track gameplay supply/demand instead of token candles. The repricing rule is published in the City Ledger.

| # | Product | Cadence | Notes |
|---|---|---|---|
| 1 | **Dynamo Bonds** | Recurring (14-day membership cycle) | The keystone — see B1. Demand from cash players *and*, indirectly, every grinder who buys one with Bolts on the Bond Board |
| 2 | **Season Pass** | Per season (~10–12 wks) | Cosmetic-only, non-expiring, separate from membership (B11) |
| 3 | **Stall Deeds** | Per season, limited, sealed-bid auction | Presence-only (B8); the "ownership" pillar without yield |
| 4 | **Cosmetic Foundry drops** | Weekly rotating + seasonal lines | **Deterministic posted prices only — no randomized premium purchases of any kind, anywhere in the product graph** |
| 5 | **Charge Locks** | Ongoing | **Non-custodial on-chain time-locks** (tokens never touch treasury keys) for 1/3/6 months → status tiers (Ember/Arc/Aurora): name-glow, exclusive cosmetic vendor access, content-poll voting weight. **No yield, no payouts, ever** — locks reduce float and confer status, nothing else |
| 6 | **Crew Charters & crest registry** | One-time per crew | |
| 7 | **Vanity registry** | One-time | Reserved names, Loftpod nameplates, title colors |

**What $AMP explicitly never buys:** combat power, gathering power, gear, resources, Bolts, market throughput, wheel spins, or any randomized outcome. (The honest scope of "no pay-to-win": premium buys identity, presence, and content breadth — never rates, stats, or market advantage.)

## C3. Bolts policy (the soft loop)

1. **Bolts is closed.** Off-chain, never tokenized, never bridged, no sanctioned Bolts→$AMP path. (Pixels tokenized its grind currency at ~2%/day inflation and had to sunset it; the grind currency must stay a designer-controlled number, not a speculator-priced one.) Grey-market OTC is designed-for, not denied — see B1 honesty clause and C7.
2. **Faucets:** NPC resource sales (dynamic-priced, band-limited, young-account-capped), quest rewards, small fixed Circuit participation rewards under daily diminishing returns. **Circuit purses are entry-fee-funded** — winners are paid from the pot minus a rake (the rake is a sink), so PvP prints nothing and win-trading farms nothing (red-team: system-printed purses are alt-farmable by trading losses).
3. **Sinks (recurring by design):** durability/repair · gear tier-ups · structure & rig upkeep · tram tolls · bank expansion · consumables · crafting fees · market listing fees + 2% Exchange tax · Circuit rake · death retrieval · Bond unbinding · Loftpod/Crew Hall construction · **the Citywide Charge** (the elastic macro-sink).
4. **Target:** sink/faucet ratio 0.9–1.1 weekly, tuned via the dynamic NPC price bands and Charge thresholds. Median player Bolts balance should grow slowly with Mastery, not with calendar time.
5. **Bond-price response levers (red-team):** a crashing Bond Bolts-price = Bolts inflation → tighten NPC bands, raise Charge thresholds, run sink events; a spiking Bond price = membership unaffordable for grinders → loosen bands or run bonus-faucet weekends. The lever list is pre-committed so tuning is policy, not panic.

## C4. Treasury policy (programmatic, published)

- **Two revenue rails (red-team — the studio must be able to make payroll without selling tokens):** the **SOL rail** funds operations, infrastructure, and the buyback program; the **$AMP rail** splits 30% burn / 70% treasury, and treasury $AMP is only ever burned later or routed to the prize reserve within its cap — **never sold on market** (Comms rule 5). pump.fun SOL creator fees are claimed continuously into the SOL rail and treated as bonus revenue.
- **Fixed monthly program:** 50% of net SOL revenue (after the ops budget) → **automated buyback executed as randomized TWAP across the month** (a published lump-sum buy on a thin pool is an MEV/frontrunning target), reported after the fact in the City Ledger. Bought $AMP splits **50% burn / 50% prize reserve** until the reserve cap, then 100% burn.
- **The City Ledger** (monthly, public, EVE-style): burns by source, buyback totals, reserve level, treasury balances and any treasury movements, faucet/sink totals, Bond price history, active-wallet stats, bot-share estimate. **Everything backward-looking disclosure, never forward-looking promise.** The program is automated precisely so no discretionary "we'll pump it" narrative can form — discretionary team buybacks are both a Howey red flag and, empirically, a failed price-support strategy; here they are supply hygiene, not price defense.

## C5. The prize reserve (the only way players ever receive $AMP)

- **Hard caps (both required):** reserve balance ≤ 5M $AMP (0.5% of supply) at any time, **and total payouts ≤ 10M $AMP (1% of supply) per rolling year** — the annual cap is what actually bounds flow (a balance cap alone allows unlimited drain-and-refill). Refill **only** by buybacks (C4); when the reserve is full, buybacks burn 100%.
- **What pays $AMP (red-team-narrowed):** only achievements that are **neither purchasable nor cheaply colludable** — in practice, the **refereed seasonal Circuit finals bracket** (entry-gated, bracket-reviewed for win-trading) and a small set of world-first Mastery records. Citywide Charge ladders, contribution boards, and participation metrics pay **untradeable regalia only** — anything a player can buy their way up (Amperite is purchasable with Bolts!) or Sybil with alts must never touch the reserve, or it becomes a sanctioned Bolts→$AMP laundry.
- **Population indexing:** winner count and prize sizes scale with verified-active population, with minimum-participation floors before any prize activates, and payouts vest over the following season (dampens the post-season sell pulse). A 100-CCU game pays a handful of small prizes, not "hundreds of winners."
- **Eligibility gate:** account ≥ 30 days + Charged during the season (**the Bolts→Bond path is the guaranteed free route to Charged** — documented in-game, backstopped by the Bond Board, and legally load-bearing: no purchase is necessary to be prize-eligible) + humanity verification at claim + one claim wallet per verified account.
- **Why so tight:** any per-hour token wage, however small, re-prices the whole game as a job and summons the bot fleet that killed every P2E economy. Prizes for scarce, refereed, human-verifiable achievement create aspiration and headlines without creating a wage. If in doubt, pay prestige in untradeable regalia instead.

## C6. Flow invariants (enforced in code, asserted in tests)

1. No server codepath mints, prints, or transfers $AMP to a player except the prize-reserve payout path.
2. No codepath converts Bolts, resources, or items into $AMP.
3. Every premium purchase emits exactly one burn event + one treasury event ($AMP rail) or one treasury event (SOL rail), on-chain, logged.
4. Bonds: created only on premium purchase; tradeable exactly once (Bond Board or direct trade); binding on trade; redemption (membership only) destroys the item.
5. Prize reserve: balance ≤ 5M; rolling-year payouts ≤ 10M; refill source = buyback transactions only.
6. Fortune Coil: no $AMP input anywhere upstream of a paid spin; paid-spin prize table contains no tradeable and no gameplay-affecting entries.
7. Randomized outcomes never follow a premium payment anywhere in the product graph (includes membership perks — the monthly cosmetic is published and deterministic).
8. Bonds, deeds, and premium cosmetics never drop on death, never enter Scrapcaches, and are excluded from any loot table.
9. Charge Locks are non-custodial on-chain time-locks; locked player tokens never touch treasury keys.
10. Treasury $AMP outflows: burn or prize-reserve only. No market sells, no transfers to team wallets.

## C7. Anti-Sybil / anti-bot (replaces the Grid A/B split)

- **The economic lever (primary):** faucet tuning keeps the fiat value of a botted Bolts-hour (via the grey-market rate the Bond Board reveals) below bot operating cost. Bots are a market; make the margin negative.
- Per-account, per-day diminishing returns on every faucet; **NPC sale volume caps on young accounts** (the faucet itself is gated, not just the market); rig output tied to owner's same-day active play (B5).
- New-account throttles: player trading at 24h with trade-value caps, Exchange at 7d, prize eligibility at 30d + Charged + humanity check. Device/IP/funding-pattern clustering flags account farms; lopsided-trade anomaly detection flags wealth funneling (including via Scrapcache looting, which is logged as a transfer).
- Server-side behavioral-entropy checks on gathering inputs (statistically perfect timing = flag), with per-session cue variation (B3).
- Bonds give gold-farmers' *customers* a sanctioned alternative — the proven demand-side suppressant (OSRS: Bonds collapsed RMT demand; they did not eliminate it, and neither will we — hence everything above).
- **KPI:** estimated bot share of gather volume < 5%; reviewed in the monthly City Ledger.

## C8. Instrumentation & tuning

Weekly internal dashboard + monthly public City Ledger: faucet vs. sink totals per source · median/p90 player Bolts · resource price index vs. NPC bands · **Bond Bolts-price (the true internal exchange rate — the single most important number in the economy; response levers pre-committed in C3.5)** · $AMP burned/locked/treasury/reserve · SOL rail revenue vs. ops burn rate · D1/D7/D30 retention · payer conversion · unique cosmetic buyers · bot-share estimate. **Launch health targets:** D1 ≥ 40%, D7 ≥ 20%, D30 ≥ 10%, payer conversion ≥ 3%, sink/faucet 0.9–1.1.

## C9. The interim-token policy (the gap the milestones create)

The token exists *now*; full utility ships at M4, months away. Unmanaged, that gap reads as abandonment and the token arrives at launch as an illiquid ghost. Policy for the build period: (1) claim creator fees continuously into the disclosed treasury and publish the wallet addresses from day one; (2) publish the City Ledger from month one, even when it only reports "fees claimed, nothing sold, N burned from early registrations"; (3) ship **one small honest utility early** at M2 — the vanity registry (reserved Spark names + founder nameplates, standard burn/treasury split) — so the token has a live, logged sink before the premium layer lands; (4) communicate the build openly under the comms rules — progress, never price.

---

# PART D — BUILD PLAN

## D1. Tech stack

- **Client:** TypeScript + Phaser 3 + Vite. Isometric tilemap, warm-dusk theme per ART-DIRECTION.md.
- **Realtime server:** Colyseus (TypeScript) — one room type per district; horizontal room instances per district under load (one world, no grid split; Nightstalls row single-instance).
- **DB:** PostgreSQL + Prisma. **Cache/presence/rate-limits:** Redis.
- **Wallet/chain:** @solana/wallet-adapter (Sign-In-With-Solana), @solana/web3.js, @solana/spl-token. $AMP = an SPL mint address. Wallet linking is **optional and late** — the full free game requires no wallet.
- **Economy service:** separate Node/TS service holding the treasury keypair; verifies on-chain payments (both rails); runs the **automated randomized-TWAP** monthly buyback; claims pump.fun creator fees; emits the City Ledger. Server-side only. C6 invariants live here as runtime assertions + integration tests.
- **Hosting:** client → Vercel/Netlify · Colyseus → Fly.io/Railway · Postgres → Neon/Supabase · Redis → Upstash.

**Golden architecture rule:** the server is authoritative for everything with value. The client renders and sends intents. Never trust the client.

## D2. Milestones & realistic timeline

| Milestone | Contents | Time |
|---|---|---|
| **M0 — Prototype** | Iso grid, click-to-move (A*), one gatherable (junk heap → Salvage) *with glint-spot layer*, inventory/hotbar | 3–7 days |
| **M1 — Single-player loop** | All 5 resources/tools/skills (each with its active layer; Tuning minigame), Mastery tracks, mobs + Brawling, healing, crafting + tiers + durability, Bolts + NPC merchants w/ price bands + quests, local save | 2–4 weeks |
| **M2 — Multiplayer** | Colyseus districts, sync, accounts (email first, SIWS optional), Postgres persistence, server-authoritative everything, chat, Tramgates, player shops, Citywide Charge v1, **vanity registry (first live $AMP sink — C9)** | 1–3 months |
| **M3 — Retention proof** | Manifest, weekly goal board, Rested Charge, crews + Crew Hall projects, first season structure, Fortune Coil (free+Bolts). **Gate: hit D7/D30 targets with the token switched off before building M4** | 3–6 weeks |
| **M4 — Economy + $AMP** | Bonds + **Bond Board** + Charged membership, season pass, stall deed auctions, Cosmetic Foundry, Charge Locks (non-custodial), dual-rail payments + oracle pricing, treasury + automated buyback + City Ledger, full C6 invariant suite | 4–7 weeks |
| **M5 — Harden & tune** | Anti-cheat, Sybil limits (C7 full stack), Scrapcaches, Exchange board (population-gated), economy dashboard, load tests, polish | ongoing |

*The one sequencing rule that separates the survivors from the graveyard: **prove retention before switching on token utility** (M3 gate before M4). A token bolted onto a game nobody replays only accelerates its death. C9 covers the token in the meantime.*

## D3. Asset plan

Prototype 100% on **Kenney CC0** (Isometric Blocks / Prototype Tiles / All-in-1) + flat-color placeholder tiles using the locked palette, so art never blocks progress. Custom look later: render Sparks, junkbots, and stalls in **MagicaVoxel** (free) at the iso angle with emissive neon — unique art, zero license risk for premium cosmetics (avoid Synty/EULA-restricted packs for anything sold).

## D4. Repo structure

```
/client        Phaser 3 game (Vite). Rendering + input + UI only.
/server        Colyseus rooms + authoritative game logic.
/shared        Types/schemas/config shared client<->server.
/db            Prisma schema + migrations.
/economy       Treasury + on-chain verification + automated buyback + City Ledger.
/assets        CC0 placeholder art during prototype.
CLAUDE.md      Guardrails for Claude Code.
```

---

# PART E — CHANGELOG: what changed from v1 and why

Each change cites the research that motivated it. Full source list at the end.

**1. Added the Dynamo Bond (the single biggest change).** v1's demand stack — cosmetics, deeds, pass, staking, governance — was mostly one-shot purchases with no *recurring, gameplay-anchored* reason to buy $AMP, which is fatal for a small-population game (cosmetic demand scales with audience size). The Bond imports the OSRS Bonds / EVE PLEX structure — the only RMT bridge with a decade-plus track record: cash players buy Bonds, grinders buy them with Bolts, everyone gets membership, and there is no sanctioned cash-out path. It creates subscription-shaped premium demand, monetizes non-wallet players indirectly, and suppresses black-market RMT demand (the main bot magnet). Bind-on-trade + Bolts unbinding fee copied from Jagex's design (also a sink). *Red-team hardening:* a dedicated city-run **Bond Board** ships day one of M4 (the keystone can't wait for order-book population gates; per-account limits prevent cornering), and membership gates **content breadth (Mastery 26–50, seasonal quests)** — the OSRS free/member split — because convenience-only membership wouldn't generate enough grinder-side Bond demand to make the bridge spin.

**2. Replaced "staking" with Charge Locks (no yield, non-custodial).** v1 listed "staking" undefined. If it implied yield, it was both a securities red flag — the SEC's 2025 staking relief covers *protocol* (PoS) staking, not issuer-run "stake our token for rewards" programs, which remain squarely Howey-exposed — and an economic hole (yield must come from somewhere; with fixed supply it drains the reserve and re-creates the P2E wage). Locks keep the float-reduction benefit and add status/voting utility with zero payout promise, implemented as on-chain time-locks so player tokens never touch treasury custody.

**3. Demoted buyback-and-burn from engine to hygiene, and gave the studio a real revenue rail.** v1's flywheel leaned on creator-fee-funded buybacks as a core value driver. The 2026 evidence is brutal: pump.fun itself spent ~$370M buying back PUMP and the token stayed ~80% below peak, capitulating in April 2026 to a programmatic model; Gunzilla's 30%-of-revenue GUN buyback didn't prevent an ~87% drawdown; and pump.fun trading volume (hence creator fees) decays toward zero for almost all tokens within weeks. Buybacks retime demand, they don't create it. v2: (a) sizes buybacks as supply hygiene, (b) automates them as randomized TWAP (removes discretion — Howey + credibility — and MEV exposure), and (c) — red-team critical — adds the **dual-rail model**: products payable in SOL as well as $AMP, so operations are funded without ever selling treasury tokens, and the studio stays solvent even at zero token volume. v1 had no fiat revenue path at all; "the economy is healthy" is meaningless if the operator isn't.

**4. Made "prove retention before token utility" a hard milestone gate, with an interim-token policy.** Every 2021–22 collapse followed the same causal chain: token yield attracted players → players were extractors, not customers → economy required accelerating new entrants → death spiral (Axie SLP emissions cut 56% then halted entirely in Jan 2026; StepN's 30-day payback math; Pegaxy's 24-day NFT supply doubling; Crabada's 20x crab inflation). The consensus 2025–26 playbook (GUNZ shipped the game first; Ronin cut emissions >20%→<1%; "play-and-own") is: the game must retain on fun alone, then the token formalizes value that already exists. Hence the M3 retention gate and the "fun with the token switched off" prime directive. *Red-team addition:* since the token is already live while the game builds, C9 defines the interim policy (published custody, month-one City Ledger, one small early sink at M2) so the gap doesn't read as abandonment.

**5. Kept player $AMP rewards, but rebuilt them as narrow, refereed prizes.** v1's "trickle" instinct was right; v2 tightens it structurally: hard-capped reserve (0.5% of supply) **plus a rolling-year payout cap (1%)**, refilled only by buybacks, payouts only for achievements that are *neither purchasable nor cheaply colludable* (refereed Circuit finals, world-first records — **not** contribution ladders, which Bolts can buy and alts can stuff), winner counts indexed to verified population, vested payouts, and eligibility gated (30-day account + Charged + humanity check, with the Bolts→Bond path as the guaranteed no-purchase route). Rationale: any per-hour wage — however small — re-prices the game as a job and attracts the mercenary capital and bot fleets that killed every P2E economy (the explicitly stated reason Sky Mavis halted SLP emissions in 2026), and a purchasable prize ladder is just a Bolts→$AMP laundry with extra steps.

**6. Stripped $AMP out of the Fortune Coil entirely, and narrowed the Bolts wheel.** v1 had paid $AMP spins with on-chain verification. Consideration + chance + a prize with real-world value is the legal definition of gambling, and 2025–26 is the worst possible moment for it: the state-level sweepstakes-casino crackdown (NY, CA, CT, MT, NJ bans; dozens of AG cease-and-desists) turns on exactly one fact — "redeemability to real money." A liquid Solana token as a wheel prize or payment replicates that structure precisely. *Red-team tightening:* because *Kater v. Churchill Downs* held that even gameplay-extending virtual items are a "thing of value," and Bolts are indirectly money-acquirable (via Bonds), paid spins award **cosmetic-only, untradeable** prizes with duplicate-pity — no consumables. The free daily spin (no consideration) keeps the fun stuff.

**7. Deleted the Grid A/B world split.** It fragmented the two things a small MMO can least afford to fragment — population density and market liquidity (player-driven markets go illiquid below a few thousand concurrent actives) — while providing negligible Sybil resistance. Replaced by account-layer defenses (C7) and horizontally-scaling district instances (with the Nightstalls row kept single-instance so shopfront scarcity means something).

**8. Rebuilt the market for a small population.** v1 assumed a global market UI. Order books die at low population, so v2 ships NPC merchants with dynamic price bands (market-maker of last resort + faucet throttle) and asynchronous player shops first, gates the order-book Exchange behind a CCU threshold, and adds the Bond Board as the one order-matched market that ships at M4 regardless. Fee-on-velocity sinks (listing fees, 2% Exchange tax, Circuit rake) follow the OSRS GE-tax / Valve marketplace pattern. *Red-team fix:* stall deeds are **presence-only and non-tradeable** (auctioned per season, incumbents match to retain) — deeds that granted throughput were purchasable market power and a de-facto yield asset.

**9. Gave every gathering skill an active layer — honestly scoped.** Four of five v1 loops were zero-decision "click and wait" — the loop shape humans churn from (and Crabada's idle mining kept extracting value even as its player count collapsed). Light rhythm layers make engaged human play worth ~20–30% and keep sessions alive. *Red-team correction:* timing cues alone favor scripts, not humans — so the layers are paired with server-side behavioral-entropy detection, per-session cue variation, and the economic lever (C7: keep botted-Bolts fiat value below bot opex), which is the defense that actually scales.

**10. Added the long-horizon goal architecture: Mastery 1–50, the Manifest, and seasons.** v1 had skills but no ladders inside them, no collection game, and no seasonal structure. The OSRS retention anatomy — explicit XP curves, self-set long goals, multiple play intensities, visible prestige regalia — is the proven spine for exactly this kind of grind game, and it monetizes cosmetics (status display needs an audience and an identity ladder). Weekly goal boards + Rested Charge + non-expiring season passes replace daily-chore pressure, matching both the cozy positioning and the industry's post-FOMO turn. Mastery 26–50 is the membership gate (change #1) — breadth, never rates or stats.

**11. Made crews structural and added the Citywide Charge.** v1's social layer was cosmetic factions and no communal mechanics. Social obligation is the strongest churn barrier in MMOs, so v2 adds Crew Halls built by collective resource projects (largest sink in the game) and the Citywide Charge — a city-wide Amperite drain that literalizes the tagline, celebrates the whole server weekly, and gives the economy an *elastic* macro-sink that auto-scales with population (the tuning knob v1's fixed sink list lacked). *Red-team boundary:* Charge and contribution ladders pay untradeable regalia only — never $AMP (see change #5).

**12. Added the communications-rules section and the City Ledger.** Marketing language is a first-order design input: "earn" framing is simultaneously the biggest Howey multiplier and the signal that summons extraction-minded players. Transparency shifted from "publish burns" (v1) to a full EVE-style monthly economic report — including treasury movements and the no-market-sell rule — with everything backward-looking, never promissory.

**13. Wallet-optional onboarding, USD-referenced pricing, and closed-loop honesty.** The full free game requires no wallet (email accounts first, SIWS later) — widest funnel, lowest regulatory surface. All premium prices are USD-referenced and dual-rail so token volatility can't kill product demand in either direction. And the doc now states plainly what v1 hand-waved: a tradeable token plus tradeable in-game value means grey-market OTC exchange *will* exist; the design suppresses its demand (Bonds), detects its flows (trade anomaly logging, loot-transfer logging, death-drop exclusions for premium items), and keeps its margins negative (faucet tuning) — rather than declaring it impossible.

### Sources (key)

- Axie collapse & 2026 SLP halt: coindesk.com/tech/2022/02/08/axie-infinity-reduces-slp-emissions-to-prevent-collapse · blog.axieinfinity.com/p/slpcap · bitpinas.com/cryptocurrency/slp-halt/
- StepN/Pegaxy/Crabada post-mortems: naavik.co/digest/stepn-rise-fall-future · defivader.medium.com (StepN, Pegaxy) · coingecko.com/research/publications/sink-or-swim-the-state-of-crabada-in-2022
- P2E root-cause consensus: vaderresearch.substack.com/p/5-theses-on-web3-gaming · yellow.com/research/from-play-to-earn-to-play-to-own-how-web3-gaming-evolved-by-2025 · Ali & Vidan, Big Data & Society (2025)
- Survivors & best practice: cryptonewsnavigator.com (GUNZ playbook) · games.gg/news/pixels-updates-token-utility · docs.echelon.io (PRIME) · dappradar.com (NXPC) · cryptodaily.co.uk/2026/05/gaming-tokens-after-web3-reset-players-before-demand
- Buyback evidence: coindesk.com/markets/2026/04/29 (PUMP 36% burn) · coingecko.com/research/publications/token-buybacks · dwf-labs.com/research/547-token-buybacks-in-web3
- OSRS/EVE models: virtgold.com/blog/osrs-bond-overview · oldschool.runescape.wiki/w/Gold_sink · arxiv.org/pdf/2210.07970 (EVE market interventions)
- pump.fun fees & decay: coinmarketcap.com/academy (Dynamic Fees V1) · crypto.news (Jan 2026 fee overhaul) · dextools.io/news/pump-fun-graduation-collapse-solana-fees-2026
- Regulatory: sec.gov (Peirce staking statement 5/29/25; Atkins "Regulation Crypto Assets" 3/17/26) · skadden.com/insights/publications/2025/08/howeys-still-here · pillarlegalpc.com (blockchain lootbox/gambling analysis) · igamingbusiness.com (2025 sweepstakes crackdown) · congress.gov H.R. 3633 (CLARITY Act status)

---

*Companion files: `ART-DIRECTION.md` (locked), `CLAUDE.md` (repo guardrails), `KICKOFF-PROMPT.md` (paste into Claude Code to begin). This document supersedes the v1 economy doc; C1–C9 are the operating spec.*

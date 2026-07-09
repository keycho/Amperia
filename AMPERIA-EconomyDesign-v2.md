# AMPERIA — Economy Design v2 ($AMP + Dynamo Bonds + Bolts)

*The operating manual for Amperia's economy. Supersedes v1 entirely. Aligned with `AMPERIA-GameBible-v2.md` Part C — where the bible states the rules, this doc states the numbers, the levers, and the reasoning. $AMP is a pump.fun token — fixed 1B supply, mint authority renounced — so no reward is ever printed. Value accrues only through buy pressure, burns, locks, and buybacks.*

---

## 1. The constraint and the prime directive

- **Supply is fixed** (1B) and **cannot be minted.** Player rewards can never come from emission.
- **The prime directive:** the game must be worth playing with the token switched off. Every token-game economy that inverted this (Axie, StepN, Pegaxy, Crabada) died the same death regardless of sink design: token yield attracted extractors instead of customers, and the economy required accelerating new entrants to pay existing ones. $AMP is the premium layer of a game that retains on fun — never the reason to play, never a wage.
- **The studio's survival is decoupled from token volume.** Operations run on the SOL revenue rail (§7). pump.fun creator fees decay toward zero for almost all tokens within weeks — they are bonus revenue, never a pillar.

## 2. The flywheel

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
     (held or routed to prizes;               ├─→ ops & payroll
      NEVER sold on market)                   │   (the studio lives here)
                            ┌─────────────────┤
                            │      50% of net SOL revenue
                            │      + pump.fun creator fees (bonus)
                            │                 │
                            │     programmatic buyback (randomized TWAP)
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

**The failure mode to never build:** any loop where playing produces tokens (or freely produces something sanctioned-convertible to tokens). Demand flows through *buying and spending*; the only player-bound $AMP is a narrow, refereed prize purse (§8).

## 3. Three value layers, three jobs

| | **Bolts** (soft) | **Dynamo Bond** (bridge item) | **$AMP** (hard) |
|---|---|---|---|
| Supply | Unlimited, game-controlled, **off-chain only — never tokenized** | Created only by premium purchase; destroyed on redemption | Fixed 1B, un-mintable |
| Get it | Playing (scav, delve, skim, tune, fight, quest) | Buy from the city ($AMP or SOL), or from a player for Bolts on the **Bond Board** | Buy on market; seasonal prizes from the reserve |
| It buys | Gear tiers, repairs, upkeep, consumables, market trades, Bonds from players | 14 days of **Charged** membership | Bonds, cosmetics, deeds, season pass, Charge Locks, charters, vanity — **never combat/gathering power, never market throughput** |
| Job | Closed loop, inflation ≈ 0 | Sanctioned RMT bridge; recurring premium demand from non-paying players | Buy pressure + burn vs. fixed supply |

**Directionality:** $AMP/SOL → Bond → (one player trade for Bolts) → membership. A dead end into gameplay. **No sanctioned path runs Bolts→$AMP** — and §10 covers the unsanctioned one honestly.

## 4. The Dynamo Bond & Charged membership (the keystone)

- **Bond:** priced ≈ **$5 USD-equivalent** (oracle-referenced; see §6 pricing rule), redeemable for 14 days of Charged. Tradeable **exactly once** — binds after its first player trade; unbinding costs a steep Bolts fee (sink). Never drops on death, never enters loot tables.
- **Bond Board (ships with the premium layer, day one):** city-run order board for Bonds only — posted bid/ask, full public price history, per-account purchase limits (anti-cornering). The Bond's Bolts price is the game's true internal exchange rate and the single most-watched number in the economy (§12).
- **Charged gates content breadth, never power:** free Sparks get the complete core game (all districts, all skills to Mastery 25, main quest line, Loftpod tiers 1–3, full market access, identical rates/stats/drops). Charged adds Mastery 26–50, seasonal quest lines, extra Manifest pages, Loftpod tiers 4–5, +2 bank tabs, +2 cosmetic loadout slots, name-glow, and a **published, deterministic** monthly cosmetic (never a random capsule). The OSRS free/member split: the free game is real, membership is the aspirational second half — that asymmetry is what makes grinders willing to farm Bolts for Bonds, which is what makes the bridge spin.
- **Why it works:** it converts fun into recurring premium demand (membership expires every 14 days), monetizes players who never open a wallet, and undercuts black-market RMT demand — the proven OSRS Bonds / EVE PLEX pattern, the only RMT bridge with a decade-plus track record.

## 5. Bolts: closed loop with recurring sinks

Every faucet needs a sink, and sinks must be **recurring** (one-time purchases don't hold an economy).

**Faucets (all throttled):** NPC resource sales at dynamic prices inside published floor/ceiling bands (the price band is the faucet throttle — flood a resource and its price slides down); quest rewards; small fixed Circuit participation rewards under daily diminishing returns. **Circuit purses are entry-fee-funded** (pot minus rake) — PvP prints nothing, so win-trading farms nothing. Mobs drop no Bolts. Passive rigs net ≈ 0 for idle owners (output scales with same-day active play).

| Sink | Mechanism |
|---|---|
| Durability + repair | All tools/weapons degrade; Tinkerbench repair costs Bolts + materials; Filament-grade is deliberately maintenance-hungry |
| Gear tiers | Tinker → Brassbound → Coilworked → Ampforged → Filament-grade, each costing Bolts + resources |
| Structure upkeep | Loftpods, rigs, masts charge periodic upkeep or decay |
| Consumables | Warmcups, Shinelure, Cellwax, food — destroyed on use |
| Tram tolls | Fast travel costs Bolts (walking free) |
| Bank-slot expansion | Steeply rising cost past base 48 slots |
| Crafting fees + recipe unlocks | Bolts to learn and use recipes |
| Market fees | Listing fee (day one) + 2% Exchange tax (when the order book opens) + Circuit rake |
| Death retrieval | Scrapcache reclaim fee + gear damage |
| Bond unbinding | Steep Bolts fee to re-tradeify a bound Bond |
| Loftpod / Crew Hall construction | The big coordinated sinks — crew projects consume huge resource batches + Bolts fees |
| **The Citywide Charge** | The elastic macro-sink: Amperite fed to the Great Dynamo weekly; thresholds **index to active-player count**, so total sink capacity scales with population automatically |

**Tuning targets:** weekly sink/faucet ratio **0.9–1.1**; median player Bolts balance grows with Mastery, not with calendar time.

**Pre-committed response levers (tuning is policy, not panic):**
- *Bond Bolts-price crashing* (= Bolts inflation): tighten NPC price bands, raise Charge thresholds, run sink events.
- *Bond Bolts-price spiking* (= membership unaffordable for grinders): loosen bands, run bonus-faucet weekends.

## 6. $AMP demand stack & pricing

**Pricing rule (volatility shield):** every premium product is **priced in USD terms** and payable on either rail — **$AMP at oracle spot** (variable token amount, ≈10% discount, 30% burn / 70% treasury) or **SOL** (100% treasury). A 10x or a −90% in $AMP changes the token amount per product, never the fiat price — so product demand and treasury revenue survive both directions. The repricing rule is published in the City Ledger.

| # | Product | Cadence | Notes |
|---|---|---|---|
| 1 | **Dynamo Bonds** | Recurring (14-day cycle) | The keystone (§4) |
| 2 | **Season Pass** | Per season (~10–12 wks) | Cosmetic-only track, non-expiring, separate from membership |
| 3 | **Stall Deeds** | Per season, limited | Sealed-bid auction; incumbents retain by matching. **Presence-only**: shopfront + signage + directory listing — never extra stock slots, better prices, or lower fees (throughput-granting deeds are purchasable market power and a de-facto yield asset). Non-tradeable |
| 4 | **Cosmetic Foundry** | Weekly rotating + seasonal lines | **Deterministic posted prices only — no randomized premium purchase exists anywhere in the product graph** |
| 5 | **Charge Locks** | Ongoing | **Non-custodial on-chain time-locks** (1/3/6 months → Ember/Arc/Aurora tiers): name-glow, exclusive cosmetic vendor, content-poll voting weight. **No yield, no payouts, ever** |
| 6 | **Crew Charters** | One-time per crew | Includes crest registry |
| 7 | **Vanity registry** | One-time | Reserved names, nameplates, title colors; **ships early (M2) as the first live sink** (§14) |

**What $AMP never buys:** combat power, gathering power, gear, resources, Bolts, market throughput, wheel spins, or any randomized outcome.

## 7. Treasury policy (programmatic, published)

- **SOL rail** (SOL product sales + pump.fun creator fees, claimed continuously): funds **operations and payroll first** — the studio never needs to sell tokens to survive — then the buyback program.
- **$AMP rail** (30% burned at purchase / 70% to treasury): treasury $AMP is only ever **burned later or routed to the prize reserve within its cap. It is never sold on market and never transferred to team wallets.** Published policy.
- **Fixed monthly program:** 50% of net SOL revenue (after ops budget) → **automated buyback executed as randomized TWAP across the month** (a published lump-sum buy on a thin pool is an MEV/front-running target). Bought $AMP: **50% burn / 50% prize reserve** until the reserve cap, then 100% burn. Reported after the fact.
- **The City Ledger** (monthly, public, EVE-MER-style): burns by source, buyback totals, reserve level, treasury balances and movements, faucet/sink totals, Bond price history, active wallets, bot-share estimate. **All disclosure is backward-looking. No forward promises, ever** — automation exists precisely so no discretionary "we'll support the price" narrative can form (a Howey aggravator and, empirically — pump.fun's own $370M failed buyback program — a losing strategy anyway).

## 8. The prize reserve (the only path from game to token)

- **Dual hard caps:** reserve balance ≤ **5M $AMP (0.5% of supply)** at any time, **and** rolling-year payouts ≤ **10M $AMP (1%)**. The annual cap is what actually bounds flow — a balance cap alone allows unlimited drain-and-refill. Refill source: buybacks only.
- **What pays $AMP:** only achievements that are **neither purchasable nor cheaply colludable** — the refereed seasonal Circuit finals bracket (entry-gated, reviewed for win-trading) and a small set of world-first Mastery records. **Never** contribution ladders, Charge leaderboards, or participation metrics: anything a player can buy with Bolts or stuff with alts would become a sanctioned Bolts→$AMP laundry. Those pay untradeable regalia.
- **Population indexing:** winner counts and prize sizes scale with verified-active population, with minimum-participation floors; payouts **vest over the following season** (dampens post-season sell pulses). A 100-CCU game pays a handful of small prizes.
- **Eligibility:** account ≥ 30 days + Charged during the season + humanity verification at claim + one claim wallet per verified account. **The Bolts→Bond path is the guaranteed free route to Charged** — documented in-game and legally load-bearing (no purchase necessary for prize eligibility).
- **Framing:** an esports purse, never a wage. Any per-hour token income, however small, re-prices the game as a job and summons the bot fleet. When in doubt, pay prestige in untradeable regalia.

## 9. Legal design rules (mechanics, not just marketing)

1. **No randomized outcome ever follows a premium payment** — anywhere in the product graph, including membership perks. (State sweepstakes/gambling enforcement 2025–26 turns on chance + consideration + a thing of real-world value; a liquid token satisfies "value" trivially.)
2. **The Fortune Coil:** free daily spin (no consideration — may include consumables) + Bolts-paid spins whose prize pool is **cosmetic-only, untradeable, duplicate-pity-protected**. No consumables in paid spins (*Kater v. Churchill Downs*: gameplay-extending items are a "thing of value"), and $AMP never touches the wheel on either side.
3. **No yield anywhere:** Charge Locks confer status/access/votes only; no staking rewards, no revenue share, no lock APY. (The SEC's 2025 staking relief covers protocol staking, not issuer-run reward programs.)
4. **Non-custodial locks:** locked player tokens sit in an on-chain time-lock, never in treasury custody.
5. **Comms rules** (bible Part A): never "earn/yield/APY/investment/price"; prizes are prizes; disclosure is backward-looking; treasury $AMP is never sold; issuer never makes value-forward statements.
6. *This section is design guidance grounded in 2025–26 sources, not legal advice — counsel review before real money flows.*

## 10. The grey market (designed-for, not denied)

A tradeable token plus tradeable in-game value means players *can* settle Bolts↔$AMP OTC, wallet-to-wallet — no invariant can stop it, and the Bond Board's public price gives that market a reference rate. OSRS Bonds didn't eliminate gold RMT; they collapsed its demand. Design for the residual:

- **The economic lever (primary):** tune faucets so the fiat value of a botted Bolts-hour stays **below bot operating cost**. Bots are a business; make the margin negative.
- Lopsided-trade anomaly detection (including Scrapcache loot transfers, which are logged as transfers); trade-value caps on young accounts; explicit ban policy.
- Premium items (Bonds, deeds, premium cosmetics) never drop on death and are excluded from all loot tables — kill-trading can't move them.
- The Bond itself is the demand-side suppressant: why buy black-market Bolts when the sanctioned bridge is safer and funds your membership?

## 11. Anti-inflation & anti-bot

- **Diminishing returns** per activity per account per day.
- **NPC sale volume caps on young accounts** — the faucet itself is gated, not just market access. New-account throttles: player trading at 24h (value-capped), Exchange at 7d, prize eligibility at 30d+.
- **Dynamic merchant pricing** inside published bands (§5).
- **Behavioral-entropy checks** on gathering inputs (statistically perfect minigame timing = flag; humans are inconsistently imperfect), with per-session cue variation. The active layers raise the scripting cost floor; the entropy checks and the §10 economic lever do the real work.
- **Device/IP/funding-pattern clustering** for account-farm detection; rig output tied to owner's same-day active play.
- **One world** (Grid A/B split deleted — density and liquidity matter more than shard-level Sybil friction, which account-layer defenses replace).
- **No pay-to-win, honestly scoped:** $AMP never buys combat/gathering power or market throughput — the invariant that protects players, reviewers, and the token at once.

## 12. Instrumentation (build the dashboard early)

Weekly internal + monthly public (City Ledger): Bolts faucet vs. sink totals per source and net supply growth %; median/P90 player Bolts; per-resource price index vs. NPC bands; **Bond Bolts-price — the single most important number in the economy** (levers pre-committed in §5); $AMP circulating / locked / burned / treasury / reserve; SOL-rail revenue vs. ops burn rate; buyback volume vs. prize payouts (payouts ≤ buyback inflow, always); creator-fee income (tracked as bonus); D1/D7/D30 retention and first-sale funnel; unique cosmetic buyers; bot-share estimate (< 5% target).

**Launch health targets:** D1 ≥ 40% · D7 ≥ 20% · D30 ≥ 10% · payer conversion ≥ 3% · sink/faucet 0.9–1.1. **Retention — not token price — is the health metric that predicts everything else.**

## 13. Implementation invariants (for code review)

1. Server-authoritative for all value; treasury keypair server-side only.
2. No codepath grants $AMP to a player except the prize-reserve payout path (both caps enforced: balance ≤ 5M, rolling-year ≤ 10M; refill = buyback transactions only).
3. No codepath converts Bolts, resources, or items into $AMP.
4. Every premium purchase emits exactly one burn event + one treasury event ($AMP rail) or one treasury event (SOL rail), on-chain, logged.
5. Bonds: created only on premium purchase; tradeable exactly once; bind on trade; redemption (membership only) destroys the item.
6. Fortune Coil: no $AMP input anywhere upstream of a paid spin; paid-spin prize table contains no tradeable and no gameplay-affecting entries.
7. Randomized outcomes never follow a premium payment anywhere in the product graph.
8. Bonds, deeds, and premium cosmetics never drop on death, never enter Scrapcaches, excluded from all loot tables.
9. Charge Locks are non-custodial on-chain time-locks.
10. Treasury $AMP outflows: burn or prize-reserve only — no market sells, no team-wallet transfers.
11. Every faucet ships with a sink; every value movement writes to the economy ledger.

## 14. Interim-token policy (the build-period gap)

The token is live now; full utility ships at M4. Unmanaged, the gap reads as abandonment. Policy: (1) claim creator fees continuously into the disclosed treasury; publish wallet addresses from day one; (2) publish the City Ledger from month one, even when it only says "fees claimed, nothing sold"; (3) ship the **vanity registry at M2** as the first live, logged sink; (4) communicate build progress openly under the comms rules — progress, never price.

## 15. Launch parameters (tunable — start here, tune weekly)

| Parameter | Launch value |
|---|---|
| $AMP-rail discount vs SOL rail | 10% |
| $AMP purchase split | 30% burn / 70% treasury |
| Buyback program | 50% of net SOL revenue, randomized TWAP, monthly |
| Bought-token split | 50% burn / 50% reserve (100% burn when reserve full) |
| Prize reserve caps | 5M balance / 10M rolling-year payouts |
| Dynamo Bond price | ≈ $5 USD-equivalent / 14 days Charged |
| Bond Board account limit | e.g. 10 Bonds/account/week (anti-corner; tune) |
| Sink/faucet target | 0.9–1.1 weekly |
| Exchange population gate | ~2–3k CCU |
| Bot-share ceiling | 5% of gather volume |

---

*Companions: `AMPERIA-GameBible-v2.md` (world + economy rules + build plan + full changelog with sources), `ART-DIRECTION.md` (locked visuals), `CLAUDE.md` (repo guardrails), `KICKOFF-PROMPT.md`.*

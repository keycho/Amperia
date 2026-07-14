# AMPERIA — Economy Design v3 ($AMP token gate + Bolts)

*The operating manual for Amperia's economy. Supersedes v1 and the v2 Dynamo-Bond design. Aligned with `AMPERIA-GameBible-v2.md` Part C and `CLAUDE.md` — where the bible states the rules, this doc states the numbers, the levers, and the reasoning. $AMP is an **ERC-20 on Robinhood Chain** (fair-launched via hood.fun) — fixed 1B supply, 18 decimals, LP permanently locked, mint renounced — so no reward is ever printed. Value accrues only through buy/hold pressure, burns, locks, and (flag-gated) buybacks. All chain constants live in `/shared/chain.ts`.*

> **v3 migration note.** $AMP moved from its previous chain/launchpad to **Robinhood Chain** (Ethereum L2 on Arbitrum Orbit, native currency ETH; ERC-20 via hood.fun). Two model changes came with it: (1) the **Dynamo Bond** bridge is replaced by a **1,000-$AMP token gate** — hold the key in your own wallet (non-custodial) and you're Charged; a guest/demo path trials the city; (2) the two-payment-rail model is replaced by **$AMP-only** purchases that split **30% burn / 70% treasury**, with the treasury funding the champions' purse and discretionary burns. There is no second rail. The buyback is **flag-gated off** (`CREATOR_REWARDS_ENABLED`) until hood.fun confirms creator-fee volume.

---

## 1. The constraint and the prime directive

- **Supply is fixed** (1B, 18 decimals) and **cannot be minted** (mint renounced; LP locked). Player rewards can never come from emission.
- **The prime directive:** the game must be worth playing with the token switched off. Every token-game economy that inverted this (Axie, StepN, Pegaxy, Crabada) died the same death regardless of sink design: token yield attracted extractors instead of customers, and the economy required accelerating new entrants to pay existing ones. $AMP is the premium layer of a game that retains on fun — never the reason to play, never a wage.
- **The studio's survival is decoupled from token volume.** The treasury only ever grows (the 70% of every spend) and only ever shrinks by burns + the champions' purse — it never market-sells, so nothing depends on trading volume. The buyback is a flag-gated hygiene option, never a pillar.

## 2. The flywheel (v3)

```
            fun, low-friction game (retention first)
                            │
         players sink hours → want identity, status,
            membership & ownership in the city
                            │
        HOLD the key            SPEND on the premium layer
   (≥ 1,000 $AMP = Charged)     (cosmetics, deeds, pass, locks…)
     non-custodial, standing         │   $AMP-ONLY
        demand floor                 ▼
             │           30% BURNED at the till (supply ↓)
             │           70% → TREASURY wallet (never sells)
             │                        │
             │              ┌─────────┴─────────┐
             │        champions' purse    discretionary burns
             │        (refereed finals)         │
             │                                  ▼
             └───────────────────────►  supply only ever FALLS

  Buyback — flag-gated (CREATOR_REWARDS_ENABLED, off for now):
  if hood.fun creator-fee volume is confirmed, flipping the flag adds a
  monthly ETH-creator-reward buyback, split 50% burn / 50% champions'
  purse. Off ⇒ it does not run and nothing else changes.
```

**In one line (the canonical statement):** *hold the 1,000-$AMP key → play for Bolts → spend $AMP → 30% burn / 70% treasury → the treasury funds the champions' purse and discretionary burns → supply only falls.*

**The failure mode to never build:** any loop where playing produces tokens (or freely produces something sanctioned-convertible to tokens). Demand flows through *holding and spending*; the only player-bound $AMP is a narrow, refereed prize purse (§8).

## 3. Two value layers, two jobs

| | **Bolts** (soft) | **$AMP** (hard) |
|---|---|---|
| Supply | Unlimited, game-controlled, **off-chain only — never tokenized** | Fixed 1B, 18-decimal ERC-20, un-mintable |
| Get it | Playing (scav, delve, skim, tune, fight, quest) | Buy on market (hood.fun / Uniswap v3); seasonal prizes from the champions' purse |
| It does | Gear tiers, repairs, upkeep, consumables, market trades | **Hold ≥ 1,000 = the Charged key** (non-custodial); **spend** on cosmetics, deeds, season pass, Charge Locks, charters, vanity — **never combat/gathering power, never market throughput** |
| Job | Closed loop, inflation ≈ 0 | Standing hold-demand + spend-burn vs. fixed supply |

**Directionality:** acquire $AMP → hold ≥ 1,000 → Charged; spend $AMP → 30% burn / 70% treasury. A dead end into gameplay. **No sanctioned path runs Bolts→$AMP** — the gate is a read-only balance check, never a conversion — and §10 covers the unsanctioned OTC market honestly.

## 4. The token gate & Charged membership (the keystone)

- **The key:** hold **≥ 1,000 $AMP** (= 1,000 × 10^18 base units) in a linked wallet. Access is checked **server-side** via ERC-20 `balanceOf` against the Robinhood Chain RPC — never client-reported, never taken into custody. Re-checked on login and periodically; a dip below the threshold starts a **24h grace** window with an in-game warning, never an instant boot (§ token-gate spec, `server/src/services/tokenGate.ts`).
- **Guest/demo path:** newcomers trial the city with no wallet — the core loop, the districts, skills to Mastery 25 — so the funnel stays wide and the regulatory surface stays low. Guests get no Charged-only content.
- **Charged gates content breadth, never power:** guest and Charged Sparks have identical rates/stats/drops and full market access. Charged adds Mastery 26–50, seasonal quest lines, extra Manifest pages, Loftpod tiers 4–5, +2 bank tabs, +2 cosmetic loadout slots, name-glow, and a **published, deterministic** monthly cosmetic (never a random capsule). The OSRS free/member split, gated by holding the key.
- **Why it works:** membership is *holding the token*, not redeeming a bought item — a standing demand floor (you must acquire and keep 1,000 $AMP to stay Charged) with zero custody, zero bridge-item attack surface, and the "own-to-belong" fantasy that carried OSRS/EVE.

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
| Loftpod / Crew Hall construction | The big coordinated sinks — crew projects consume huge resource batches + Bolts fees |
| **The Citywide Charge** | The elastic macro-sink: Amperite fed to the Great Dynamo weekly; thresholds **index to active-player count**, so total sink capacity scales with population automatically |

**Tuning targets:** weekly sink/faucet ratio **0.9–1.1**; median player Bolts balance grows with Mastery, not with calendar time.

**Pre-committed response levers (tuning is policy, not panic):**
- *Bolts inflating* (buying too much): tighten NPC price bands, raise Charge thresholds, run sink events.
- *Bolts deflating* (grinders squeezed): loosen bands, run bonus-faucet weekends.

## 6. $AMP demand stack & pricing

**Pricing rule (volatility shield):** every premium product is **priced in USD terms** and paid in **$AMP at oracle spot** (variable token amount, **30% burn / 70% treasury**). A 10x or a −90% in $AMP changes the token amount per product, never the fiat price — so product demand and treasury revenue survive both directions. The repricing rule is published in the City Ledger.

| # | Product | Cadence | Notes |
|---|---|---|---|
| 1 | **The Charged key** | Standing (hold ≥ 1,000 $AMP) | Not a purchase from the city — hold the tokens in your own wallet and you're Charged (§4) |
| 2 | **Season Pass** | Per season (~10–12 wks) | Cosmetic-only track, non-expiring, separate from membership |
| 3 | **Stall Deeds** | Per season, limited | Sealed-bid auction; incumbents retain by matching. **Presence-only**: shopfront + signage + directory listing — never extra stock slots, better prices, or lower fees (throughput-granting deeds are purchasable market power and a de-facto yield asset). Non-tradeable |
| 4 | **Cosmetic Foundry** | Weekly rotating + seasonal lines | **Deterministic posted prices only — no randomized premium purchase exists anywhere in the product graph** |
| 5 | **Charge Locks** | Ongoing | **Non-custodial on-chain time-locks** (1/3/6 months → Ember/Arc/Aurora tiers): name-glow, exclusive cosmetic vendor, content-poll voting weight. **No yield, no payouts, ever** |
| 6 | **Crew Charters** | One-time per crew | Includes crest registry |
| 7 | **Vanity registry** | One-time | Reserved names, nameplates, title colors; **ships early (M2) as the first live sink** (§14) |

**What $AMP never buys:** combat power, gathering power, gear, resources, Bolts, market throughput, wheel spins, or any randomized outcome.

## 7. Treasury policy (programmatic, published)

- **$AMP-only, 30/70:** every spend burns **30% on-chain at the till** (ERC-20 transfer to the dead address `0x…dEaD`) and routes **70% to the treasury wallet**. Treasury $AMP is only ever **burned later or routed to the champions' purse within its cap. It is never sold on market and never transferred to team wallets.** Published policy — the treasury only grows (the 70%) and only shrinks by burns + purse.
- **Buyback — flag-gated (`CREATOR_REWARDS_ENABLED`, off for now):** hood.fun has not confirmed creator-fee volume, so there is **no buyback at launch**. If confirmed, flipping the flag adds a **monthly buyback sourced from ETH creator rewards**, executed as randomized TWAP across the month (a published lump-sum buy on a thin pool is an MEV/front-running target). Bought $AMP: **50% burn / 50% champions' purse** until the purse cap, then 100% burn. Reported after the fact. While off, none of this runs.
- **The City Ledger** (monthly, public, EVE-MER-style): burns by source, buyback totals (0 while the flag is off), purse level, treasury balances and movements, faucet/sink totals, active wallets (Charged key-holders), bot-share estimate. **All disclosure is backward-looking. No forward promises, ever** — any buyback is automated precisely so no discretionary "we'll support the price" narrative can form (a Howey aggravator and, empirically — large programmatic buyback programs have not held price — a losing strategy anyway).

## 8. The champions' purse (the only path from game to token)

- **Dual hard caps:** purse balance ≤ **5M $AMP (0.5% of supply)** at any time, **and** rolling-year payouts ≤ **10M $AMP (1%)**. The annual cap is what actually bounds flow — a balance cap alone allows unlimited drain-and-refill. Funding: the treasury (the 70% share) and, only if `CREATOR_REWARDS_ENABLED` is set, the buyback's purse half.
- **What pays $AMP:** only achievements that are **neither purchasable nor cheaply colludable** — the refereed seasonal Circuit finals bracket (entry-gated, reviewed for win-trading) and a small set of world-first Mastery records. **Never** contribution ladders, Charge leaderboards, or participation metrics: anything a player can buy with Bolts or stuff with alts would become a sanctioned Bolts→$AMP laundry. Those pay untradeable regalia.
- **Population indexing:** winner counts and prize sizes scale with verified-active population, with minimum-participation floors; payouts **vest over the following season** (dampens post-season sell pulses). A 100-CCU game pays a handful of small prizes.
- **Eligibility:** account ≥ 30 days + Charged during the season (holding the key) + humanity verification at claim + one claim wallet per verified account.
- **Framing:** an esports purse (Comms rule 4), never a wage and never a paid chance. Any per-hour token income, however small, re-prices the game as a job and summons the bot fleet. When in doubt, pay prestige in untradeable regalia.

## 9. Legal design rules (mechanics, not just marketing)

1. **No randomized outcome ever follows a premium payment** — anywhere in the product graph, including membership perks. (State sweepstakes/gambling enforcement 2025–26 turns on chance + consideration + a thing of real-world value; a liquid token satisfies "value" trivially.)
2. **The Fortune Coil:** free daily spin (no consideration — may include consumables) + Bolts-paid spins whose prize pool is **cosmetic-only, untradeable, duplicate-pity-protected**. No consumables in paid spins (*Kater v. Churchill Downs*: gameplay-extending items are a "thing of value"), and $AMP never touches the wheel on either side.
3. **No yield anywhere:** Charge Locks confer status/access/votes only; no staking rewards, no revenue share, no lock APY. (The SEC's 2025 staking relief covers protocol staking, not issuer-run reward programs.)
4. **Non-custodial by construction:** the token gate is a read-only balance check and Charge Locks are on-chain time-locks — player tokens never enter treasury custody.
5. **Comms rules** (bible Part A): never "earn/yield/APY/investment/price"; prizes are prizes; disclosure is backward-looking; treasury $AMP is never sold; issuer never makes value-forward statements.
6. *This section is design guidance grounded in 2025–26 sources, not legal advice — counsel review before real money flows.*

## 10. The grey market (designed-for, not denied)

A tradeable token plus tradeable in-game value means players *can* settle Bolts↔$AMP OTC, wallet-to-wallet — no invariant can stop it. There is no sanctioned Bolts→$AMP path (the gate never converts). Design for the residual:

- **The economic lever (primary):** tune faucets so the fiat value of a botted Bolts-hour stays **below bot operating cost**. Bots are a business; make the margin negative.
- Lopsided-trade anomaly detection (including Scrapcache loot transfers, which are logged as transfers); trade-value caps on young accounts; explicit ban policy.
- Premium items (deeds, premium cosmetics) never drop on death and are excluded from all loot tables — kill-trading can't move them.
- The legitimate supply — buy the token, hold the key, play — is cheap and safe, which is itself the demand-side suppressant for black-market Bolts.

## 11. Anti-inflation & anti-bot

- **Diminishing returns** per activity per account per day.
- **NPC sale volume caps on young accounts** — the faucet itself is gated, not just market access. New-account throttles: player trading at 24h (value-capped), Exchange at 7d, prize eligibility at 30d+.
- **Dynamic merchant pricing** inside published bands (§5).
- **Behavioral-entropy checks** on gathering inputs (statistically perfect minigame timing = flag; humans are inconsistently imperfect), with per-session cue variation. The active layers raise the scripting cost floor; the entropy checks and the §10 economic lever do the real work.
- **Device/IP/funding-pattern clustering** for account-farm detection; rig output tied to owner's same-day active play.
- **One world** (Grid A/B split deleted — density and liquidity matter more than shard-level Sybil friction, which account-layer defenses replace).
- **No pay-to-win, honestly scoped:** $AMP never buys combat/gathering power or market throughput — the invariant that protects players, reviewers, and the token at once.

## 12. Instrumentation (build the dashboard early)

Weekly internal + monthly public (City Ledger): Bolts faucet vs. sink totals per source and net supply growth %; median/P90 player Bolts; per-resource price index vs. NPC bands; **Bolts sink/faucet ratio — the health of the soft loop** (levers pre-committed in §5); $AMP circulating / locked / burned / treasury / purse + Charged key-holder count; (flag-gated) buyback volume vs. prize payouts (payouts ≤ inflow, always); D1/D7/D30 retention and first-sale funnel; unique cosmetic buyers; bot-share estimate (< 5% target).

**Launch health targets:** D1 ≥ 40% · D7 ≥ 20% · D30 ≥ 10% · payer conversion ≥ 3% · sink/faucet 0.9–1.1. **Retention — not token price — is the health metric that predicts everything else.**

## 13. Implementation invariants (for code review)

1. Server-authoritative for all value; the treasury **wallet key** is server-side only (env var; never client/repo).
2. No codepath grants $AMP to a player except the champions'-purse payout path (both caps enforced: balance ≤ 5M, rolling-year ≤ 10M; funded by treasury / flag-gated buyback purse-half).
3. No codepath converts Bolts, resources, or items into $AMP. The token gate is a read-only `balanceOf` check — it never moves, holds, or converts anyone's $AMP.
4. Every premium purchase is $AMP-only and emits exactly one burn event (30% to the dead address) + one treasury event (70%), on-chain, logged.
5. Access: the Charged key is holding ≥ 1,000 × 10^18 $AMP, verified server-side via SIWE + `balanceOf`; the guest/demo path grants no Charged content. Nothing is minted, sold, or bound to grant access.
6. Fortune Coil: no $AMP input anywhere upstream of a paid spin; paid-spin prize table contains no tradeable and no gameplay-affecting entries.
7. Randomized outcomes never follow a premium payment anywhere in the product graph.
8. Deeds and premium cosmetics never drop on death, never enter Scrapcaches, excluded from all loot tables.
9. Charge Locks are non-custodial on-chain time-locks.
10. Treasury $AMP outflows: burn or champions' purse only — no market sells, no team-wallet transfers.
11. Every faucet ships with a sink; every value movement writes to the economy ledger.

## 14. Interim-token policy (the build-period gap)

The token launches on hood.fun now; full utility ships at M4. Unmanaged, the gap reads as abandonment. Policy: (1) publish the treasury + token addresses from day one; if `CREATOR_REWARDS_ENABLED` is set, claim hood.fun ETH creator rewards into the disclosed accounting; (2) publish the City Ledger from month one, even when it only says "nothing sold, N burned"; (3) ship the **vanity registry at M2** as the first live, logged sink; (4) communicate build progress openly under the comms rules — progress, never price.

## 15. Launch parameters (tunable — start here, tune weekly)

| Parameter | Launch value |
|---|---|
| Chain | Robinhood Chain (EVM L2, native ETH) · $AMP = ERC-20, 18 decimals |
| $AMP purchase split | 30% burn / 70% treasury |
| Token gate threshold | 1,000 $AMP (= 1,000 × 10^18) to hold the Charged key |
| Token-gate dip grace | 24h with in-game warning before access is revoked |
| Buyback program | **Off** (`CREATOR_REWARDS_ENABLED=false`); if on: monthly ETH-creator-reward buyback, randomized TWAP |
| Bought-token split (if buyback on) | 50% burn / 50% champions' purse (100% burn when purse full) |
| Champions' purse caps | 5M balance / 10M rolling-year payouts |
| Sink/faucet target | 0.9–1.1 weekly |
| Exchange population gate | ~2–3k CCU |
| Bot-share ceiling | 5% of gather volume |

---

*Companions: `AMPERIA-GameBible-v2.md` (world + economy rules + build plan + full changelog with sources), `ART-DIRECTION.md` (locked visuals), `CLAUDE.md` (repo guardrails), `/shared/chain.ts` (chain constants).*

# AMPERIA — Economy Design ($AMP + Bolts)

*The operating manual for Amperia's economy. $AMP is a pump.fun token — fixed supply, mint authority renounced — so the entire design is a **buy-and-burn flywheel**: gameplay creates token demand, the token funds better gameplay, and both compound. No reward is ever printed.*

---

## 1. The constraint

- **Supply is fixed** (standard pump.fun 1B) and **cannot be minted.** Player rewards can never come from emission.
- The token gains value only through: **(a) buy pressure** (things players must buy $AMP to do), **(b) burns** (permanent supply reduction), **(c) staking locks** (float removed from market), **(d) buybacks** (real revenue purchasing tokens).
- **Revenue exists to power this:** pump.fun creator/trading fees (paid in SOL, claimable anytime) + premium in-game sales. That revenue is the fuel; the treasury is the engine.

## 2. The flywheel

1. Game is fun and **free to start** → player base grows.
2. Players want the **ownership/status layer** — rare cosmetics, land deeds, season pass, boosts, staking perks.
3. Getting it requires **buying $AMP on the market** → buy pressure.
4. Spending $AMP in-game **burns a share** (supply ↓) and routes the rest **to the treasury**.
5. Treasury (SOL creator fees + premium revenue) runs **buyback-and-burn** and refills a **finite prestige-reward reserve** → more buy pressure + scarcity.
6. Visible on-chain burns + a growing game attract holders, who are incentivized to **recruit players** (their bag benefits when the game grows) → back to 1.

**The failure mode to never build:** a grind-to-dump loop. If players can farm $AMP (or freely convert soft currency into it), they sell it and the flywheel spins backwards — the Axie/SLP collapse. Demand flows through *buying and spending*; player earnings are a capped trickle from a buyback-fed reserve.

## 3. Two currencies, two jobs

| | **Bolts** (soft) | **$AMP** (hard) |
|---|---|---|
| Supply | Unlimited, game-controlled | Fixed 1B, un-mintable |
| Earn | Playing (scav, delve, skim, tune, fight, quest) | Buy on market; small prestige rewards from reserve |
| Buys | Gear tiers, repairs, upkeep, consumables, market trades | Cosmetics, deeds, pass, staking, governance — **never power** |
| Goal | Closed loop, inflation ≈ 0 | Max buy pressure + burn vs. fixed supply |

**They are not freely convertible.** No open Bolts→$AMP exchange exists, ever. Contact points are narrow (see §5).

## 4. Bolts: closed loop with recurring sinks

Every faucet needs a sink, and sinks must be **recurring** (one-time purchases don't hold an economy). The sink set:

| Sink | Mechanism |
|---|---|
| Durability + repair | All tools/weapons degrade with use; repair at the Tinkerbench costs Bolts + materials |
| Gear tiers | Tinker → Brassbound → Coilworked → Ampforged → Filament-grade, each costing Bolts + resources |
| Structure upkeep | Loftpods, Auto-claw rigs, Antenna masts charge periodic upkeep or decay |
| Consumables | Warmcups, Shinelure, Cellwax, food — destroyed on use |
| Tram tolls | Fast travel between discovered districts costs Bolts (walking free) |
| Bank-slot expansion | Steeply rising Bolts cost past the base 48 slots — targets hoarders |
| Crafting fees + recipe unlocks | Bolts cost to learn and use recipes |
| Market listing fee | Small non-refundable Bolts fee per listing |
| Death retrieval | Reclaiming a Scrapcache costs a fee + gear damage |

Resource sinks mirror this: crafting, repair kits, structure builds/upkeep, multi-ingredient cooking, and combat consumables give Salvage/Brass/Amperite/Glowkoi/Signal permanent demand curves.

**Tuning target:** median active player's daily Bolts sink ≥ daily Bolts faucet. Measured on the dashboard, tuned weekly.

## 5. Where Bolts and $AMP touch (narrow, controlled)

1. **Buy $AMP → spend in-game** (the main loop): demand in, tokens burned. ~90% of the coupling.
2. **Co-payment:** premium mints can cost *Bolts + $AMP together* — the Bolts half is **destroyed**, the $AMP half burned/treasuried. Veterans spend hoards toward token-gated goods without ever minting sell-side $AMP.
3. **Prestige rewards:** season champions, tournament winners, rare achievements earn actual $AMP — paid from a **hard-capped reserve refilled only by treasury buybacks**, gated by staking and/or proof-of-humanity. A trickle to the best, never a farmable faucet.

## 6. $AMP demand sinks

| Sink | Split |
|---|---|
| Premium cosmetic mints (NFTs, capped editions, cosmetic-only) | burn share / treasury share |
| Land deeds / premium plots (capped supply) | burn / treasury |
| Season pass | 100% treasury → funds buyback |
| Paid Fortune Coil spins ($5-equivalent in $AMP, on-chain verified) | 50% burn / 50% treasury |
| Boosts & convenience (XP boosters, extra spins, flair) | burn / treasury |
| Staking (governance, event access, reward eligibility, revenue share) | locked, not burned — float ↓ |
| Market premium-trade fee | 95% seller / 5% treasury |

**Rule:** every monetization dollar ends up either **burning $AMP or buying $AMP**. That keeps the game aligned with holders instead of competing with them.

## 7. Treasury policy

Publish a transparent, governable split — e.g. **40% of monthly revenue → buyback-and-burn, 20% → prestige-reward reserve (buyback-and-hold), 40% → development & live-ops.** On-chain, verifiable, adjusted by governance. Public burn reports double as marketing.

## 8. Access model

**Free-to-start.** No token requirement to play — the player base (top of the flywheel) must be unconstrained. $AMP gates the premium layer only. If anything is token-gated beyond premium goods, it's the *cash-out privilege* (prestige-reward eligibility requires a small stake), never the fun.

## 9. Anti-inflation & anti-bot

- **Diminishing returns** per activity per player per day.
- **Shared/capped reward pools** per district — mass farming dilutes itself.
- **Dynamic merchant pricing** — NPC prices float with world supply.
- **New-wallet rate limits**; staking/proof-of-humanity gate on reward eligibility; per-grid earn progress (inventory shared across Grid A/B, earnings tracked separately).
- **No pay-to-win, ever** — the invariant that protects players, reviewers, and the token all at once.

## 10. Instrumentation (build the dashboard early)

Track daily/weekly: Bolts faucet vs. sink totals and net supply growth %; median/P90 player Bolts; per-resource market price index; **$AMP** circulating vs. staked vs. cumulative burned; treasury SOL + $AMP balances; buyback volume vs. reward payouts (payouts must stay ≤ buyback inflow); creator-fee income; D1/D7/D30 retention and first-sale funnel; earnings-distribution/Sybil signals. Tune weekly. Retention — not token price — is the health metric that predicts everything else.

## 11. Implementation invariants (for code review)

1. Server-authoritative for all value. 2. Treasury keypair server-side only. 3. $AMP never buys power. 4. Any code granting $AMP draws from the capped reserve — never fabricates. 5. No Bolts→$AMP conversion path exists. 6. Every faucet ships with a sink. 7. Every value movement writes to the economy ledger.

---

*Companions: `AMPERIA-Game-Bible.md` (world + build plan), `ART-DIRECTION.md` (locked visuals), `CLAUDE.md` (repo guardrails), `KICKOFF-PROMPT.md` (paste into Claude Code).*

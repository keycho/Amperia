# AMPERIA — Claude Code Kickoff Prompt (v2.1 — fast track)

*The build order for Claude Code. Supersedes the v2 milestone sequencing: multiplayer comes FIRST (right after M0), and content is built inside it. Source-of-truth docs are unchanged: `CLAUDE.md`, `AMPERIA-GameBible-v2.md`, `AMPERIA-EconomyDesign-v2.md`, `ART-DIRECTION.md` (including its Part II addendum).*

---

You are building **AMPERIA**, an isometric cozy salvage-punk MMO. Read `CLAUDE.md`, `AMPERIA-GameBible-v2.md`, `ART-DIRECTION.md` (both parts), and `AMPERIA-EconomyDesign-v2.md` before writing code — they own world names, architecture rules, the locked palette, and the economy. Follow them exactly.

## North star

- **Prime directive:** the game must be worth playing with the token switched off. No $AMP/Bond/premium code until FT4, and FT4's money paths move at a deliberately careful pace no matter how fast everything else goes.
- **Economy habits from day one:** config-driven constants (no magic numbers), every value movement ledger-logged, pure tested functions for all value math, comms-rules-compliant UI strings (never "earn/yield/investment").
- **Architecture (now urgent, not future):** the moment multiplayer exists, **the server is authoritative for everything with value** — movement validation, gather timing, yields, inventory, Bolts. Client sends intents and renders. Do NOT ship client-computed gathering into multiplayer "temporarily"; retrofitting authority is the expensive rewrite this ordering exists to avoid. All gameplay timers are **elapsed-time-based (delta ms), never frame-count-based** — the server owns them.
- **Art:** cozy salvage-punk per ART-DIRECTION.md — palette-only colors, neon = interactable, characters at ~1.5–2 tile-heights (Part II §10.1), warm dusk always.

Work one checkbox at a time, commit each with a clear message, push after every few commits and at every tag. Don't stop to ask questions unless truly blocked — make the reasonable choice, note it in the commit message, keep moving.

## FT0 — Finish M0 (in progress)

- [ ] Complete M0.5 (inventory + hotbar) and M0.6 (verification pass + `PROGRESS.md` + tag `m0-complete`) as originally specced. While closing this out, convert any frame-based timers (gather progress, glint windows) to elapsed-time.

## FT1 — Multiplayer skeleton (target: days, not weeks)

- [ ] **FT1.1 — Server scaffold.** `/server`: Colyseus (TypeScript, strict) with one room type: **The Filament**. `/db`: Prisma + Postgres (accounts, characters, inventory, ledger). Shared schemas in `/shared`. Local dev runs with one command (server + client + db via docker-compose or equivalent).
- [ ] **FT1.2 — Accounts.** Email/password (or magic-link) accounts first; SIWS wallet linking is a stub for later. Session tokens; character created on first login.
- [ ] **FT1.3 — Authoritative movement.** Client sends move intents; server runs A* validation and broadcasts positions; client renders + predicts. Multiple browsers see each other move in The Filament with name labels.
- [ ] **FT1.4 — Authoritative gathering.** Port the M0 gather loop server-side: server owns node state, gather timers, glint windows (server rolls the window, client renders it, clicks are intents with server-side timing check), yields from the pure `/shared` functions, inventory in Postgres. **Every yield writes to the ledger table.**
- [ ] **FT1.5 — Chat + presence.** Room chat, join/leave notices, `/near`. Profanity-filter stub.
- [ ] **FT1.6 — Deploy.** Server to Fly.io/Railway, client to Vercel/Netlify, Postgres to Neon/Supabase. A public URL where two strangers can walk around and gather together. Tag `ft1-multiplayer-live`, push, update `PROGRESS.md` with the URL.

## FT2 — Content, built inside multiplayer (target: ~2–4 weeks)

One commit per checkbox; every system server-authoritative + config-driven + ledger-logged from birth.

- [ ] **FT2.1** All five resources + tools + their active layers (bible B3: glint / seam-fork / pulse / cast-tension / frequency-match — the Tuner minigame is the flagship, make it feel good). Correct-tool-required from config.
- [ ] **FT2.2** Mastery 1–50 tracks for all six skills (config XP curves; breadth unlocks, not rate multipliers beyond the modest config curve). Skills panel.
- [ ] **FT2.3** Mobs (Scuttlebots, Junkhounds) + Brawling, server-side AI and combat. No Bolts/loot drops from mobs — rare Manifest trophies only.
- [ ] **FT2.4** Healing: Great Dynamo zone + placeable Heatlamps.
- [ ] **FT2.5** Crafting + gear tiers (Tinker → Brassbound → Coilworked) + durability + Tinkerbench repair (the recurring sink).
- [ ] **FT2.6** Bolts + NPC merchant with **dynamic price bands** (floor/ceiling from config, price slides with volume — this becomes the live faucet throttle) + tutorial quests + 2 dailies under a daily cap.
- [ ] **FT2.7** Districts 2–3: The Tangle (PvE mobs first; PvP flag later) and The Canals (skimming + Griddle), connected by Tramgates (Bolts toll = sink). The Underworks as an interior delving map.
- [ ] **FT2.8** The Manifest (collection log) + weekly goal board + Rested Charge.
- [ ] **FT2.9** Citywide Charge v1: donate Amperite at the Dynamo, weekly meter, city lights brighten with the meter (ART-DIRECTION Part II §11.3), weekend buff on threshold.
- [ ] **FT2.10** Loftpods in The Terrarium (tiers 1–3) + basic crew charters (name + crest, Bolts-priced placeholder until FT4 swaps in the real charter product).
- [ ] Tag `ft2-content-complete`.

## FT3 — Public playtest = the retention gate (target: ~2 weeks of real data)

- [ ] **FT3.1** Telemetry: D1/D7 return, session length, faucet/sink totals, median Bolts — the internal dashboard from Economy Design §12.
- [ ] **FT3.2** Fortune Coil free daily spin (untradeable prizes; no paid spins yet). Death Scrapcaches in PvE form (drop + reclaim fee; PvP looting waits for The Tangle's PvP flag).
- [ ] **FT3.3** Onboarding pass: first 10 minutes tutorialized, then open the doors publicly and build in public.
- [ ] **Gate:** two consecutive weekly cohorts show real return (target D7 ≥ 20%, judged honestly). Fix the game, not the number, until this holds. Then FT4.

## FT4 — The token layer (deliberately careful — this is the vault)

Order within FT4: **vanity registry → Bonds/membership → the rest.** Every step: C6 invariants as tests *before* mainnet, treasury service code reviewed line-by-line, one week on devnet before real funds, no exceptions — this is the only part of the project where slow is the strategy.

- [ ] **FT4.1** `/economy` service: payment verification (dual rail: $AMP at oracle spot with ~10% discount / SOL), burn+treasury event emission, on-chain logging. Vanity registry ships first (the first live sink, per Economy Design §14).
- [ ] **FT4.2** Dynamo Bonds + Charged membership (content-breadth gates: Mastery 26–50, seasonal quests, Loftpod 4–5, bank tabs) + the **Bond Board** (bid/ask, price history, per-account limits).
- [ ] **FT4.3** Season Pass (non-expiring), Cosmetic Foundry (deterministic prices only), Charge Locks (non-custodial on-chain time-locks), stall deed auctions.
- [ ] **FT4.4** Treasury program: automated randomized-TWAP monthly buyback, prize reserve with both caps, first **City Ledger** publication.
- [ ] **FT4.5** Full C6 invariant suite green + anti-Sybil stack (young-account NPC-sale caps, trade-value caps, behavioral-entropy flags). Tag `ft4-economy-live`.

## FT5 — Harden & tune (ongoing)

Anti-cheat depth, load tests, The Tangle PvP flag + PvP Scrapcache looting, Deep Tangle/Boneyards/The Circuit + refereed seasonal finals, Exchange board when CCU justifies it, weekly economy tuning via the Economy Design §5 levers.

## Rules that override everything else

- Commit per checkbox; push often; `npm test` green at every commit.
- No magic numbers (all tunables in `/shared` config) · palette-only colors · world nouns exactly per CLAUDE.md · comms rules in all UI text.
- **Server-authoritative from FT1 onward — no client-computed value, ever, not even temporarily.**
- **All timers elapsed-time-based.** The server rolls all RNG for value (yields, rare finds, glint windows).
- FT4 does not start before FT3's gate, and nothing in FT4 touches mainnet without tests + devnet soak.
- If ambiguous: simplest option consistent with the Game Bible v2, note it in the commit, keep moving.

Continue from wherever the current milestone stands.

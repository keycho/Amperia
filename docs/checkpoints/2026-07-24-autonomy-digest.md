# AUTONOMY-MODE CHECKPOINT DIGEST (reconstructed from the durable git record)

**Infrastructure note first:** the container rolled back to a mid-July snapshot between
turns, taking the scratchpad (the original digest narrative + staged shot pairs) with it.
Every commit survived on origin — the tree was restored via `git reset --hard origin`,
migrations re-deployed, Prisma client regenerated, stack rebuilt, suite re-verified
(270 green). Commit messages were written to carry the numbers and decisions for exactly
this contingency; this digest is rebuilt from them. Losses that cannot be re-created:
the notch-3 "before" frames for the N4 before/after pairs (that grade no longer exists
to shoot). The final v4 state is fully evidenced in `docs/screenshots/marketing/`
(committed). The ch4-5 story shots were re-taken live after recovery.

## Queue status
- N4a → N4b → N4c → N4d: DONE, all gates green.
- S2c (chapters 4-5): DONE, all gates green.
- U1 (darkness mechanic): next — then U2, U3, U5 with the five-shot checkpoint.

## N4 block — SHARP & VARIED (commits e41fdba, 9b85474, 38ff921, 5a0678b, c1f1740, 9d49652)
- **N4a pixel integrity:** fx-pool falloff quantized to 5 dithered bands (POOL_BANDS
  tunable); plaza haze rides the banded texture; PP3 bloom audited clean (thresholded
  0.8, full-res, no downsample); pixelArt/roundPixels/zoom ladder verified already
  correct. Gate: same-anchor 2x floor crops — diffuse wash lifted.
- **N4b contrast:** midGamma 0.6→0.72 (mid-crush released), maxAlpha 0.68, 5 darkness
  bands, floor micro-contrast spreads up ~1.6x. Numbers (dynamo-wide anchor):
  dark<60 65.3% → 66.5%; local micro-contrast 6.203 → 6.315.
  **Metric decision:** frame-wide midtone stddev replaced with mean |dL| between
  adjacent lit pixels — the stddev proxy punishes darkening by homogenizing the
  shrinking mid population.
- **N4c color budget v2:** object colors added to MATERIAL_COLORS, all brightness-capped
  below the warm glow: paintCyanDeep #2E6E78, paintMoss #5C6E42, paintPlum #6A4A78,
  paintCream #A8A296, waterDeep #1C3648, waterSheen #4A5E88. Five vendor hues assigned
  deterministically by stall sequence (adjacent never repeat). Water = coldest thing on
  screen (blue-teal base, purple sheen, sparse warm glints). Jackets draw from the set.
  Teal's interactable job carried by GLOW, not hue. ART-DIRECTION bumped to v4.
- **N4d reshoot:** marketing set re-taken under v4 (title, market-night, foundry, plaza,
  roofline-vista, ledger) + NEW fishing-spot + NEW underworks-lift frames — all
  committed to docs/screenshots/marketing/. title-bg.jpg regenerated from the v4 plaza.
  Final numbers: dark 66.4%, micro-contrast 6.384 (+2.9% vs notch 3) — darker AND
  sharper on both axes.
- **Red gate caught + fixed (c1f1740):** first N4 tour failed 2 states — the U4
  world-map island anchor sat under the hover/fare card dock; moved to the clear
  upper-left. Re-run: 0 failures, 64 states, both resolutions. Walkthrough 13/13.

## Website + comms (24b7815, 3306140, 10f2c2d)
- Site committed as delivered (dist/ wrapper flattened). Permanent banned-words gate
  over website/*.html (word-boundary, markup-stripped, two sanctioned allowances).
- Founder rulings applied: six phrase families promoted to permanent allowances;
  the one real hit ("the token earns") replaced in docs.html with the ruled phrasing
  ("the creator rewards paid on $AMP's trading volume on Robinhood Chain").

## S2c — chapters 4-5 (03e2271, a353b3f, 32548de, babdaea, 6daa785)
- Script implemented verbatim. Vessa live as 'barkeep' with bar-door precedence;
  keepsakes barChalk + unclaimedLamp with thumbs + Manifest entries.
- **Keepsake result-card** (founder note 3): halo + 72px thumb + name + caption in the
  story panel. Bug caught in shots: the card keyed the thumb by raw icon id instead of
  itemThumbKey() — fixed, re-verified.
- Shot-run incidents, all diagnosed and fixed in the committed driver: gathers bounced
  (required tool must be in the ACTIVE hotbar slot — Skimnet slot 2, Drillhammer slot
  1); a Scuttlebot flattened the gatherer (mob-distance >= 8 seam selection); the card
  sat one 'continue' past the driver's stop (four outro lines).
- **Honesty note:** ch5 brass gathered fully live (0→8). ch4's glowkoi finish is seeded
  — the koi shadow-window is real-time and cannot land on the 5-10x slow headless
  clock; all story intents around it are live server truth.
- Gates: tour 0 failures on the S2c build (682s), suite green, 16 story tests.

## Taste calls made under autonomy (all tunable)
- POOL_BANDS=5; midGamma 0.72; maxAlpha 0.68; DARKNESS.bands=5; floor spread values in
  floorTiles.ts; the five vendor hues + water pair in palette.ts; water sheen alpha
  0.34; the micro-contrast metric definition (histo script).

## U1 — the darkness mechanic (0cc2a81)
- Wicklamp + Cellwax burn (ledger sink), server light-radius gate on gather/attack,
  banded darkness overlay (ink 0.93, never pure black), wisp courtesy pools, chasm
  void tiles, ember floor + guide-glow path to the lift (no-stranding), HUD gauge.
- Probes banked: u1-lone-light-pool, u1-ember-guide-glow (digest dir).
- Tuning note for review: guide-glow dots read faint at 1280x720 — candidate for a
  brightness/density notch; all values tunable (CONFIG.underworks.lamp, overlay 0.93).
- Incident: updateDarkness ran in the Colyseus pre-decode window (join resolves
  before first state decode — the session's recurring lesson); held at full dark.

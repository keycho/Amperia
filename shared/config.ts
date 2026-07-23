/**
 * AMPERIA game constants — every tunable lives here, not in game logic.
 *
 * The economy is tuned weekly via pre-committed levers (Economy Design v2 §5),
 * so the no-magic-numbers habit starts at M0: server (later) validates against
 * this config; the client uses it for display/prediction only.
 */
export const CONFIG = {
  /** Isometric tile metrics — 2:1 diamond. */
  tile: {
    width: 64,
    height: 32,
  },

  map: {
    /** Map is size × size tiles (the compact districts: Tangle/Stacks/Terrarium). */
    size: 40,
    /**
     * W0 BREATHING ROOM: the Filament is the starter island and carries the
     * whole first loop, so it rides a larger footprint — ~1.5×/axis, ~2.25×
     * the area — to give the plaza, market, and gather pockets room to
     * breathe. The Stacks (the free second district, PP6) got the same
     * treatment. Tangle/Terrarium stay 40.
     */
    filamentSize: 60,
    stacksSize: 60,
    /** Seed for deterministic map decoration + node scatter. */
    seed: 20260709,
  },

  camera: {
    /** The ONLY zooms the wheel lands on (F1). Texel-crisp set: textures
     *  bake 2× and draw at 0.5, so these ratios decimate uniformly under
     *  NEAREST — any other ratio (0.75, 1.5) shimmers the pixel grid. */
    zoomSteps: [0.5, 1, 2] as const,
    /** Pixels from viewport edge that trigger edge-pan. */
    edgePanMarginPx: 24,
    /** Edge-pan speed in world px/s (at zoom 1). */
    edgePanSpeed: 520,
    /** Lerp factor for camera follow (0–1, higher = snappier). */
    followLerp: 0.08,
    /** Max void visible past a deck edge, in SCREEN px — constant at every
     *  zoom (the old fixed world-px margin showed 2× the void at zoom 2). */
    edgeVoidScreenPx: 140,
  },

  player: {
    /** Seconds to walk one tile (A* path steps tween at this rate). */
    secondsPerTile: 0.21,
    /** Spawn tile: stepping off the tram at the east gate, onto the market
     *  spine that runs west into the Dynamo plaza (W0 layout). */
    spawn: { x: 52, y: 30 },
  },

  /** The Fortune Coil (S4): ONE free spin daily — the wheel takes NO
   *  currency input of ANY kind (asserted in shared/coil.ts and the
   *  handler). Prizes are consumables, small Bolts, Coil shards toward
   *  the exclusive trail, and Manifest fillers — all untradeable. */
  coil: {
    shardsForCosmetic: 6,
    /** Extra shard weight per shardless spin (duplicate-pity ramp). */
    pityWeightStep: 3,
    /** The Coil-exclusive cosmetic (TRAIL slot). */
    cosmetic: 'glimmerTrail',
    prizes: [
      { id: 'bolts-s', label: '15 Bolts', kind: 'bolts', weight: 24, amount: 15 },
      { id: 'bolts-m', label: '40 Bolts', kind: 'bolts', weight: 12, amount: 40 },
      { id: 'bolts-l', label: '90 Bolts', kind: 'bolts', weight: 4, amount: 90 },
      { id: 'warmcup', label: 'Warmcups', kind: 'item', weight: 15, amount: 2, itemId: 'warmcup' },
      { id: 'cellwax', label: 'Cellwax', kind: 'item', weight: 14, amount: 3, itemId: 'cellwax' },
      { id: 'salvage', label: 'A Salvage haul', kind: 'item', weight: 14, amount: 20, itemId: 'salvage' },
      { id: 'filler', label: 'Gilded Scrap', kind: 'item', weight: 3, amount: 1, itemId: 'gildedScrap' },
      { id: 'shard', label: 'A Coil Shard', kind: 'shard', weight: 8, amount: 1 },
      { id: 'shard2', label: 'Twin Coil Shards', kind: 'shard', weight: 3, amount: 2 },
    ],
  },

  /** The Ledgerhouse (S5): banked slots, inside the building only.
   *  Expansion is the hoarder sink — steeply rising Bolts per +8. */
  bank: {
    baseSlots: 48,
    slotsPerExpansion: 8,
    maxSlots: 96,
    expansionCosts: [400, 1200, 3600, 9000, 20000, 45000],
  },

  /** Rested Charge (S3): the first N minutes of GATHERING each UTC day
   *  boost gather XP only — never resources, never combat XP; the faucet
   *  is untouched. Missing days never punishes; it just refills daily. */
  restedCharge: {
    dailyMinutes: 40,
    xpMultiplier: 1.25,
  },

  /** The weekly goal board (S2): pool → 8 deterministic picks per UTC
   *  Monday week; rewards claimable on any 5, hard ceiling. NO streaks,
   *  no penalties — a missed week costs nothing, ever. */
  goals: {
    perWeek: 8,
    /** Weekly claim ceiling — the "any 5" rule. */
    maxClaims: 5,
    /** Regalia tokens toward the seasonal cosmetic (granted on the 5th
     *  claim of a week); at this many tokens the Circuit Banner arrives. */
    tokensForSeasonal: 4,
    seasonalCosmetic: 'circuitBanner',
    pool: [
      { id: 'g-salvage', label: 'Haul 120 Salvage from the heaps', kind: 'gather', itemId: 'salvage', target: 120, bolts: 40 },
      { id: 'g-brass', label: 'Delve 40 Brass from the seams', kind: 'gather', itemId: 'brass', target: 40, bolts: 45 },
      { id: 'g-amperite', label: 'Pull 15 Amperite out of the pulse', kind: 'gather', itemId: 'amperite', target: 15, bolts: 50 },
      { id: 'g-koi', label: 'Skim 12 Glowkoi from the canal', kind: 'gather', itemId: 'glowkoi', target: 12, bolts: 45 },
      { id: 'g-signal', label: 'Tune in 10 Signal from the masts', kind: 'gather', itemId: 'signal', target: 10, bolts: 45 },
      { id: 'g-craft', label: 'Craft 2 pieces at the Tinkerbench', kind: 'craft', target: 2, bolts: 40 },
      { id: 'g-craft2', label: 'Craft a Brassbound-or-better piece', kind: 'craft', minTier: 2, target: 1, bolts: 55 },
      { id: 'g-donate', label: 'Donate 10 Amperite to the Charge', kind: 'donate', target: 10, bolts: 50 },
      { id: 'g-sell', label: 'Sell 40 resources at the Nightstalls stand', kind: 'sellNpc', target: 40, bolts: 35 },
      { id: 'g-shop', label: 'Move goods through a player shop', kind: 'shopSale', target: 1, bolts: 45 },
      { id: 'g-trade', label: 'Settle a trade with another Spark', kind: 'trade', target: 1, bolts: 40 },
      { id: 'g-discover', label: 'Log something new in the Manifest', kind: 'discover', target: 1, bolts: 55 },
      { id: 'g-brawl', label: 'Put down 8 feral junkbots', kind: 'brawl', target: 8, bolts: 45 },
      // District goals (D3) — reasons to ride the line.
      { id: 'g-tram', label: 'Ride the tram 5 times', kind: 'travel', target: 5, bolts: 35 },
      // Parity activities (U1) — one goal per new thing to do.
      { id: 'g-deliver', label: 'Run 3 parcels up the Stacks', kind: 'deliver', target: 3, bolts: 40 },
      { id: 'g-tend', label: 'Tend 5 Terrarium planters', kind: 'tend', target: 5, bolts: 40 },
      { id: 'g-dray', label: 'Bring down a rogue Draymule', kind: 'hunt', target: 1, bolts: 60 },
      { id: 'g-stacks', label: 'Scavenge 60 Salvage in the Stacks alleys', kind: 'gather', itemId: 'salvage', district: 'stacks', target: 60, bolts: 45 },
      { id: 'g-roofline', label: 'Tune 8 Signal up on the Roofline', kind: 'gather', itemId: 'signal', district: 'stacks', target: 8, bolts: 50 },
      { id: 'g-compost', label: 'Turn 40 Salvage of Terrarium compost', kind: 'gather', itemId: 'salvage', district: 'terrarium', target: 40, bolts: 45 },
    ],
  },

  /** Nameplate proximity fading (S0) — crowds must not become text piles.
   *  Presentation only; the last-inspected Spark stays readable. */
  nameplates: {
    /** Full-alpha names within this chebyshev tile distance. */
    fullTiles: 8,
    /** Hidden beyond this distance (lerp between the two). */
    hideTiles: 13,
    /** Alpha at the far edge of the fade band. */
    fadedAlpha: 0.25,
    /** With this many Sparks in the room or fewer, names are always on. */
    alwaysOnAtOrBelow: 4,
  },

  gathering: {
    /** Junk heaps → Salvage (Scavving) — glint-spot active layer. */
    junkHeap: {
      nodeCount: 15,
      /** Seconds per gather cycle. */
      gatherSeconds: 2.6,
      /** Base yield range per cycle (inclusive). */
      yieldMin: 1,
      yieldMax: 3,
      /** Node respawn cooldown after depletion. */
      respawnSeconds: 20,
      /** The glint-spot active layer (Game Bible B3, Scavving row). */
      glint: {
        /** Glint appears once per cycle, inside this fraction of the cycle. */
        earliestCycleFraction: 0.15,
        latestCycleFraction: 0.55,
        /** Seconds the glint stays clickable. */
        windowSeconds: 0.8,
        /** Yield multiplier when the glint is clicked (rounded). */
        yieldMultiplier: 1.5,
        /** Rare-find roll only happens on glint hits (Game Bible B3). */
        rareFindChance: 0.08,
        /** Manifest rare variant granted on a successful rare-find roll. */
        rareFindItem: 'gildedScrap',
      },
      /** Minimum tile distance between scattered nodes. */
      minNodeSpacing: 3,
      /** Rare COSMETIC roll per completed heap (I3): the Alley Beanie.
       *  Presentation only, untradeable, ledger-logged on grant. */
      rareCosmetic: { id: 'alleyBeanie', chance: 0.02 },
    },

    /** Brass seams → Brass (Delving) — seam-fork active layer. */
    brassSeam: {
      nodeCount: 8,
      /** Seconds to work one vein segment. */
      segmentSeconds: 2.0,
      /** Yield range per segment (inclusive). */
      segmentYieldMin: 1,
      segmentYieldMax: 2,
      /** Segments in a full vein (forks appear between segments). */
      maxSegments: 4,
      /** Seconds the live spark-trail cue stays readable at a fork. */
      forkCueSeconds: 1.8,
      /** Rare-find roll only on completing the full vein. */
      rareFindChance: 0.07,
      rareFindItem: 'blueHotBrass',
      respawnSeconds: 30,
      /** Seams pack tight inside the roped scrap yard (composition §B11). */
      minNodeSpacing: 2,
    },

    /** Amperite crystals → Amperite (Delving) — pulse-timing active layer. */
    amperite: {
      nodeCount: 6,
      /** Strikes before the crystal is spent. */
      strikes: 4,
      /** Pulse rhythm (seconds between glow peaks). */
      pulsePeriodSeconds: 1.15,
      /** Strike lands "on-pulse" within this window around a peak. */
      pulseWindowSeconds: 0.38,
      yieldOnPulse: 2,
      /** Lattice shatters off-pulse: reduced yield. */
      yieldOffPulse: 1,
      respawnSeconds: 28,
      minNodeSpacing: 3,
    },

    /** Glowkoi → Glowkoi (Skimming) — cast-and-tension active layer. */
    glowkoi: {
      spotCount: 5,
      /** Seconds a telegraphed shadow drifts before it slips away. */
      shadowSeconds: 8,
      /** Cast wind-up before tension starts. */
      castSeconds: 0.7,
      /** Tension needle triangle-wave period. */
      tensionPeriodSeconds: 1.5,
      /** Sweet-zone width as a fraction of the bar. */
      sweetZoneFraction: 0.28,
      /** Koi size classes: telegraphed by shadow scale, weighted rolls. */
      sizes: [
        { id: 'small', weight: 0.5, yieldAmount: 1, shadowScale: 0.7 },
        { id: 'plump', weight: 0.32, yieldAmount: 2, shadowScale: 1.0 },
        { id: 'grand', weight: 0.18, yieldAmount: 3, shadowScale: 1.35 },
      ],
      /** Chance the drifting koi is Prismatic (rare Manifest variant). */
      rareChance: 0.05,
      rareFindItem: 'prismaticGlowkoi',
      /** Extra Glowkoi landed when the rare is caught. */
      rareBonusYield: 2,
      respawnSeconds: 16,
    },

    /** Antenna-shrines → Signal (Tuning) — the flagship frequency match. */
    antenna: {
      shrineCount: 3,
      /** Length of one tuning session. */
      tuneSeconds: 8,
      /** Target drift: f(t) = 0.5 + amplitude * sin(speed*t + phase). */
      driftSpeed: 0.55,
      amplitude: 0.32,
      /** Needle counts as locked within this distance of the target. */
      lockTolerance: 0.07,
      /** Yield = base + round(bonus * lockRatio). */
      yieldBase: 1,
      yieldLockBonus: 5,
      /** Ghost Frequencies need a near-perfect lock. */
      rareLockRatio: 0.85,
      rareChance: 0.12,
      rareFindItem: 'ghostFrequency',
      respawnSeconds: 24,
      minNodeSpacing: 8,
    },
  },

  /** Tools (Game Bible B3). The required tool must sit in the ACTIVE hotbar
   *  slot — switching tools is a real act, validated server-side. */
  tools: {
    requiredByNode: {
      junkHeap: 'magclaw',
      brassSeam: 'drillhammer',
      amperite: 'drillhammer',
      glowkoi: 'skimnet',
      antenna: 'tuner',
    },
    /** New Sparks start with the tool belt on the hotbar (interim until the
     *  Tinkerbench/merchant loops land). Riveter is inert for now. */
    starterHotbar: ['magclaw', 'drillhammer', 'skimnet', 'tuner', 'riveter'],
  },

  /** The coolant canal (built channel, never open water) on the west side. */
  canal: {
    xMin: 8,
    xMax: 9,
    yMin: 8,
    yMax: 52,
    /** Rows where decking bridges the channel (walkable) — the market spine
     *  crosses 3-wide (W0 layout). */
    bridgeRows: [29, 30, 31],
  },

  inventory: {
    slots: 24,
    stackMax: 999,
    hotbarSlots: 6,
  },

  chat: {
    /** Chebyshev tile radius reported by /near. */
    nearRadiusTiles: 8,
    /** H2 rate limit: at most `maxPerWindow` messages per rolling window;
     *  past it the channel asks for a breath (one notice per burst). */
    rate: {
      maxPerWindow: 6,
      windowSeconds: 10,
    },
  },

  /**
   * Bolts + the Nightstalls merchant (Economy Design §5 published bands).
   * The merchant BUYS the five resources inside floor/ceiling bands (sale
   * volume slides price down; recovers over time) and SELLS basics. The
   * daily NPC-sale cap is the anti-Sybil throttle mechanism.
   */
  economy: {
    merchant: {
      /** Max Bolts of NPC sales per account per UTC day (generous). */
      dailySaleCapBolts: 1500,
      /** Published buy bands per resource. */
      buy: {
        salvage: { floor: 1, ceiling: 3, slidePerUnit: 0.004, recoverPerHour: 0.5 },
        brass: { floor: 3, ceiling: 7, slidePerUnit: 0.01, recoverPerHour: 0.4 },
        amperite: { floor: 4, ceiling: 9, slidePerUnit: 0.012, recoverPerHour: 0.4 },
        glowkoi: { floor: 3, ceiling: 8, slidePerUnit: 0.01, recoverPerHour: 0.5 },
        signal: { floor: 5, ceiling: 12, slidePerUnit: 0.015, recoverPerHour: 0.35 },
      },
      /** Fixed-price wares (Bolts). */
      sells: [
        { itemId: 'magclaw', price: 40 },
        { itemId: 'drillhammer', price: 60 },
        { itemId: 'skimnet', price: 60 },
        { itemId: 'tuner', price: 80 },
        { itemId: 'riveter', price: 50 },
        { itemId: 'warmcup', price: 12 },
        { itemId: 'cellwax', price: 18 },
      ],
      /** Server-checked interaction reach (chebyshev tiles). */
      tradeRadiusTiles: 3,
    },
    /**
     * EARLY BOLTS TUNING (EBT): a Spark's first ~15 minutes should net
     * ~75–100 Bolts so gather → sell → buy always affords a cheap ware and
     * the first hour feels generous. Every grant here is config-driven and
     * ledger-logged under its OWN faucet source (starterBonus / manifestFind).
     * Copy always REWARDS, never "earn" (comms rules).
     */
    onboarding: {
      /** The first N quest turn-ins per Spark pay this multiple (a one-time
       *  welcome bonus on top of the base reward; the bonus half is logged
       *  as its own faucet). */
      starterQuestBonus: { count: 3, multiplier: 2 },
      /** Bolts for logging something NEW in the Manifest, by page — rare
       *  gather variants pay most, wardrobe unlocks least (they already came
       *  from a quest). Always within the 10–25 band. */
      manifestFind: {
        byPage: {
          scavving: 25,
          delving: 25,
          skimming: 25,
          tuning: 25,
          gardens: 20,
          mobs: 20,
          errands: 15,
          wardrobe: 10,
        } as Record<string, number>,
        default: 15,
      },
    },
    /** Warmcup heal on use. */
    warmcupHeal: 10,
    /** Cellwax durability restored on use (lands with gear durability). */
    cellwaxDurability: 40,

    /**
     * Player↔player direct trade. The guardrails ship with GENEROUS
     * defaults on purpose — the MECHANISM (young-account gates, per-day
     * caps, lopsided flags, both-sides ledger valuation) is the point:
     * it's the anti-RMT instrumentation the token layer depends on later.
     */
    trade: {
      /** Both Sparks must stand within this reach of each other. */
      requestRadiusTiles: 6,
      /** Accounts younger than this can't trade at all. */
      minAccountAgeHours: 24,
      /** Accounts younger than this many days trade under the value cap. */
      youngAccountDays: 7,
      /** Max estimated Bolts value a young account may trade per UTC day. */
      youngDailyValueCapBolts: 2000,
      /** Max completed trades per account per UTC day (all ages). */
      dailyTradeCountCap: 40,
      /** One side staging more than this × the other = anomaly row. */
      lopsidedFactor: 8,
      /** An untouched trade window closes itself after this long. */
      timeoutSeconds: 90,
      /**
       * Ledger valuation for non-resource items (resources price at their
       * NPC-band midpoint). Stable config numbers, not live prices — the
       * anomaly pass needs consistent readings week to week.
       */
      valuationBolts: {
        warmcup: 12,
        cellwax: 18,
        magclaw: 40,
        drillhammer: 60,
        skimnet: 60,
        tuner: 80,
        riveter: 50,
        sparkwrench: 50,
        brassMagclaw: 60,
        coilMagclaw: 180,
        brassDrillhammer: 70,
        coilDrillhammer: 200,
        brassSkimnet: 65,
        coilSkimnet: 190,
        brassTuner: 80,
        coilTuner: 220,
        brassSparkwrench: 90,
        coilSparkwrench: 240,
        gildedScrap: 40,
        blueHotBrass: 60,
        prismaticGlowkoi: 60,
        ghostFrequency: 80,
        dentedCrest: 60,
      } as Record<string, number>,
      /** Fallback estimated value for anything not listed above. */
      valuationDefaultBolts: 5,
    },

    /**
     * Player shop stalls on the Nightstalls market lane (E2). Rent is a
     * REAL recurring Bolts sink; the sale fee is destroyed. NOTE: stalls
     * allocate first-come at a flat rent for now — premium deed AUCTIONS
     * replace this allocation method at the token layer (M4), so keep the
     * allocation path swappable (see ShopService.rent).
     */
    shops: {
      /** Bolts per week of stall rent (destroyed — a sink, ledger-logged). */
      rentBoltsPerWeek: 150,
      /** A shopkeeper may pre-pay at most this many weeks ahead. */
      maxWeeksAhead: 2,
      /** Fraction of every sale destroyed as the stall fee (a sink). */
      saleFeeFraction: 0.02,
      /** Max distinct stock lines a stall can carry. */
      maxStockLines: 12,
      /** Server-checked interaction reach (chebyshev tiles). */
      reachTiles: 3,
      /** Asking-price bounds (Bolts per unit). */
      minPriceBolts: 1,
      maxPriceBolts: 100000,
    },
  },

  /**
   * Districts + tram travel. The Tangle is the first dangerous district:
   * darker, denser nodes, more bots, and Scrapcache death rules. The tram
   * toll is a recurring Bolts sink (golden rule 9).
   */
  travel: {
    /** The tram line, in stop order (D3) — tolls are charged PER HOP. */
    line: ['filament', 'stacks', 'terrarium', 'tangle'],
    /** Bolts per hop along the line (recurring sink). */
    tollBolts: 5,
    /**
     * PP6: stops that ride FREE regardless of distance. The Stacks is a free
     * second district — it widens the starter world and teaches the tram loop
     * without a Bolts gate; distance keeps its price everywhere else.
     */
    freeStops: ['stacks'] as string[],
    /** Tangle gate + arrival tile. */
    tangleSpawn: { x: 4, y: 20 },
    /** Stacks gate + arrival tile (districts block D1). */
    stacksSpawn: { x: 4, y: 29 },
    /** Terrarium gate + arrival tile (districts block D2). */
    terrariumSpawn: { x: 4, y: 20 },
  },

  /**
   * U1a THE STACKS — parcel runs from the junction dispatch post. Small
   * Bolts under a daily cap (parity, not printing); the occasional rare
   * tip is a Manifest chit, never currency.
   */
  deliveries: {
    rewardBolts: 25,
    dailyCapBolts: 150,
    /** Chance the recipient tips the wax-sealed chit (Manifest rare). */
    rareTipChance: 0.07,
    /** Rotating destinations: named towers, their landing tile + level
     *  (W0 layout — each landing hugs its tower's wall; kestrel is up top). */
    destinations: [
      { id: 'kestrel', tower: 'Tower Kestrel', landing: { x: 26, y: 14 }, level: 3, recipient: "Wickla's cousin", line: 'Fourth-floor landing, off the Roofline. Mind the laundry.' },
      { id: 'marrow', tower: 'Tower Marrow', landing: { x: 2, y: 5 }, level: 0, recipient: 'Old Ferro', line: "He'll grumble. Leave it by the door anyway." },
      { id: 'grist', tower: 'Tower Grist', landing: { x: 36, y: 6 }, level: 0, recipient: 'the antenna crew', line: 'They tip in static and good moods.' },
      { id: 'anvil', tower: 'Tower Anvil', landing: { x: 57, y: 9 }, level: 0, recipient: "Marlow's welder", line: 'East rim, last door before the void.' },
      { id: 'cinder', tower: 'Tower Cinder', landing: { x: 16, y: 20 }, level: 0, recipient: "the noodle cart's supplier", line: 'Smells like broth all the way up.' },
      { id: 'lantern', tower: 'Tower Lantern', landing: { x: 8, y: 11 }, level: 0, recipient: 'the roof gardener', line: "The tower with the green crown. Can't miss it." },
      { id: 'bellows', tower: 'Tower Bellows', landing: { x: 16, y: 43 }, level: 0, recipient: 'a night-shift tuner', line: 'Knock twice — she sleeps days.' },
      { id: 'fathom', tower: 'Tower Fathom', landing: { x: 52, y: 51 }, level: 0, recipient: 'nobody asked who', line: "Far corner. No questions — it's paid for." },
    ],
  },

  /**
   * U1b THE TERRARIUM — tending the shared gardens. A short timing
   * interaction; a clean cue-hit blooms brighter odds. Tends grant only
   * RARE ROLLS (herb Manifest rares), never resource volume.
   */
  tending: {
    seconds: 2.4,
    /** The bloom cue lands somewhere in this window of the channel. */
    cueEarliest: 0.9,
    cueLatest: 1.7,
    /** Click within this of the cue = a clean tend. */
    cueWindowMs: 450,
    dailyCapTends: 5,
    /** Everyone sees a tended planter bloom for this long. */
    bloomSeconds: 3600,
    rareChanceGood: 0.22,
    rareChancePlain: 0.09,
  },

  /** THE TERRARIUM — the hanging-garden tier (districts block D2). */
  terrarium: {
    /** Compost heaps (the peaceful scavenge; Scavving tool rules apply). */
    compostCount: 8,
    /** Loftpod berth pads are 3×3; the count comes from the map. */
    berthSize: 3,
    /** Compost glint rares (replace the junk rare in this district). */
    rares: ['silverfern', 'emberseed'],
  },

  /**
   * LOFTPODS (D2b): housing as identity — every cost is a Bolts/resource
   * SINK (golden rule 9), every knob is display-only. One pod per Spark.
   */
  loftpods: {
    placeCostBolts: 250,
    /** /haul — moving house is a recurring sink. */
    haulCostBolts: 60,
    /** Tier 1 → 2 → 3 (index 0 buys tier 2). Bolts + resources burn. */
    upgrades: [
      { bolts: 800, materials: { salvage: 60, brass: 30 } },
      { bolts: 2400, materials: { brass: 60, amperite: 30, signal: 12 } },
    ],
    /** Exterior dyes — sanctioned palette blends, crafted-tier (free). */
    dyes: ['plum', 'teal', 'ochre', 'rose'],
    dyeCostBolts: 40,
  },

  /** THE STACKS — the vertical quarter (districts block D1, §12B brief). */
  stacks: {
    /** Dense alley junk (scattered only in the canyon alleys). */
    junkCount: 14,
    /** Ground-level antenna shrines (ordinary Signal). */
    antennaGround: 2,
    /** Roofline shrines — the city's best Signal (Tuning endgame, D1c). */
    antennaRoofline: 2,
    /** Yield multiplier on Roofline shrines (location-based, never paid). */
    rooflineSignalMult: 1.75,
    /** The Roofline: the +3 walkable rooftop terrace (W0: grown with the
     *  60×60 quarter — 11×8 over the fused towers east of the north street). */
    roofline: { x0: 25, y0: 8, x1: 35, y1: 15, level: 3 },
  },
  tangle: {
    /** Node-count multipliers over the Filament config counts. */
    nodeMult: { junkHeap: 1.6, brassSeam: 1.5, amperite: 1.6 },
    antennaCount: 2,
    scuttlebotCount: 7,
    scuttlebotHomeBox: { x0: 11, y0: 11, x1: 28, y1: 28 },
    /** Scrapcache death rules (Tangle only; the Filament stays free). */
    scrapcache: {
      windowSeconds: 300,
      reclaimFeeBolts: 10,
    },
  },
  junkhound: {
    count: 3,
    maxHp: 22,
    contactDamage: 4,
    moveSecondsPerTile: 0.24,
    aggroRadiusTiles: 4,
    leashRadiusTiles: 9,
    windupSeconds: 0.5,
    attackCooldownSeconds: 1.2,
    respawnSeconds: 30,
    xpBrawlingPerKill: 26,
    trophyChance: 0.03,
    homeBox: { x0: 14, y0: 14, x1: 25, y1: 25 },
  },

  /**
   * U1a SPARKWISPS — drifting charge-critters in the Stacks alleys (bible
   * B6). An ambient hazard, not a hunter: they never chase far, they zap
   * whatever touches them, and they pop with a rare filament trophy.
   */
  sparkwisp: {
    count: 4,
    maxHp: 10,
    contactDamage: 3,
    moveSecondsPerTile: 0.55,
    aggroRadiusTiles: 1,
    leashRadiusTiles: 3,
    windupSeconds: 0.35,
    attackCooldownSeconds: 2.4,
    respawnSeconds: 90,
    xpBrawlingPerKill: 8,
    trophyChance: 0.25,
    /** Deep-south alleys — the dark end of the canyon (W0 layout). */
    homeBox: { x0: 4, y0: 35, x1: 56, y1: 54 },
  },

  /**
   * U1c THE ROGUE DRAYMULE — the Tangle's slow-clock mini-boss (bible
   * B6): a tanky cargo bot worth calling friends for. GUARANTEED trophy
   * + good salvage to everyone who landed a hit — goods, never Bolts.
   */
  draymule: {
    maxHp: 420,
    contactDamage: 9,
    moveSecondsPerTile: 0.6,
    aggroRadiusTiles: 2,
    leashRadiusTiles: 30,
    windupSeconds: 1.0,
    attackCooldownSeconds: 2.2,
    respawnSeconds: 0, // never respawns on the mob clock — the spawn timer owns it
    xpBrawlingPerKill: 120,
    trophyChance: 1,
    homeBox: { x0: 10, y0: 10, x1: 30, y1: 30 },
    /** Minutes between visits (uniform roll in the band). */
    spawnMinutesMin: 18,
    spawnMinutesMax: 35,
    /** The cargo: salvage + brass to every Spark who landed a hit. */
    salvageMin: 18,
    salvageMax: 30,
    brassMin: 4,
    brassMax: 8,
  },

  /**
   * Quests (server-tracked; copy follows the comms rules — quests REWARD,
   * never "earn"). The tutorial chain teaches the whole core loop; dailies
   * repeat under a per-day cap.
   */
  quests: {
    /** Max daily-quest turn-ins per UTC day. */
    dailyTurnInCap: 2,
    defs: [
      {
        id: 'tut1',
        name: 'First Salvage',
        // C4: one number for the first task — the FIRST BOLTS checklist and
        // this quest both say 5 (client TUT_GATHER = 5). 5 Salvage → ~15 Bolts,
        // enough for the cheapest ware, so the gather→sell→buy loop completes.
        copy: 'Gather 5 Salvage from the glinting heap.',
        step: { type: 'gather', itemId: 'salvage', qty: 5 },
        // EBT quest-step curve 10/25/15 — the welcome 2× (onboarding
        // .starterQuestBonus) doubles these for a Spark's first three turn-ins.
        rewards: { bolts: 10 },
        prereq: null,
        repeatable: null,
      },
      {
        id: 'tut2',
        name: 'Market Hands',
        copy: 'Sell 10 resources at the Nightstalls stand.',
        step: { type: 'sellNpc', itemId: null, qty: 10 },
        rewards: { bolts: 25 },
        prereq: 'tut1',
        repeatable: null,
      },
      {
        id: 'tut3',
        name: 'Bench Work',
        copy: 'Craft a piece of gear at the Tinkerbench.',
        step: { type: 'craft', itemId: null, qty: 1 },
        rewards: { bolts: 15, cosmetic: 'starterScarf' },
        prereq: 'tut2',
        repeatable: null,
      },
      {
        id: 'tut4',
        name: 'Wide Hands',
        copy: 'Gather with two skills beyond Scavving.',
        step: { type: 'gatherSkills', itemId: null, qty: 2 },
        rewards: { bolts: 50, cosmetic: 'salvagerSatchel' },
        prereq: 'tut3',
        repeatable: null,
      },
      {
        id: 'tut5',
        name: 'A Spark for the City',
        copy: 'Donate 5 Amperite to the Charge Warden at the Dynamo.',
        step: { type: 'donate', itemId: 'amperite', qty: 5 },
        rewards: { bolts: 80, cosmetic: 'bulbHat' },
        prereq: 'tut4',
        repeatable: null,
      },
      {
        id: 'daily1',
        name: 'Stand Supply',
        copy: 'Gather 30 Salvage for the stand.',
        step: { type: 'gather', itemId: 'salvage', qty: 30 },
        rewards: { bolts: 40 },
        prereq: null,
        repeatable: 'daily',
      },
      {
        id: 'daily2',
        name: 'Koi for the Kitchens',
        copy: 'Land 5 Glowkoi from the canal.',
        step: { type: 'gather', itemId: 'glowkoi', qty: 5 },
        rewards: { bolts: 50 },
        prereq: null,
        repeatable: 'daily',
      },
    ],
    /** Server-checked NPC reach (chebyshev tiles). */
    npcRadiusTiles: 3,
  },

  /**
   * Gear tiers + durability (Game Bible: Tinker → Brassbound → Coilworked
   * for now). Tiers buy config multipliers only — never new drop tables.
   * Broken gear is unusable, never lost.
   */
  gear: {
    maxDurability: { 1: 120, 2: 200, 3: 320 } as Record<number, number>,
    /** Durability lost per completed gather act / landed swing. */
    durabilityPerUse: 1,
    /** Gather-seconds multiplier by tool tier (composes with Mastery). */
    gatherSpeedMult: { 1: 1, 2: 0.92, 3: 0.85 } as Record<number, number>,
    /** Brawling damage multiplier by weapon tier (bare hands = 1). */
    weaponDamageMult: { 1: 1.25, 2: 1.5, 3: 1.9 } as Record<number, number>,
    repair: {
      /** Bolts per 100 durability restored (rounded up, min 1). */
      boltsPer100: 20,
      /** Fraction of the craft materials charged for a full repair. */
      materialFraction: 0.25,
    },
    /** Tinkerbench recipes: Bolts + resources → gear. */
    recipes: [
      { id: 'wrench1', output: 'sparkwrench', bolts: 30, materials: { salvage: 12, brass: 4 } },
      { id: 'wrench2', output: 'brassSparkwrench', bolts: 90, materials: { salvage: 24, brass: 14 } },
      { id: 'wrench3', output: 'coilSparkwrench', bolts: 240, materials: { salvage: 40, brass: 26, amperite: 14 } },
      { id: 'magclaw2', output: 'brassMagclaw', bolts: 60, materials: { salvage: 20, brass: 12 } },
      { id: 'magclaw3', output: 'coilMagclaw', bolts: 180, materials: { salvage: 36, brass: 24, amperite: 12 } },
      { id: 'drill2', output: 'brassDrillhammer', bolts: 70, materials: { salvage: 22, brass: 14 } },
      { id: 'drill3', output: 'coilDrillhammer', bolts: 200, materials: { salvage: 38, brass: 26, amperite: 14 } },
      { id: 'skim2', output: 'brassSkimnet', bolts: 65, materials: { salvage: 18, brass: 10, glowkoi: 6 } },
      { id: 'skim3', output: 'coilSkimnet', bolts: 190, materials: { salvage: 32, brass: 20, amperite: 10, glowkoi: 12 } },
      { id: 'tuner2', output: 'brassTuner', bolts: 80, materials: { salvage: 20, brass: 12, signal: 6 } },
      { id: 'tuner3', output: 'coilTuner', bolts: 220, materials: { salvage: 36, brass: 22, amperite: 12, signal: 12 } },
      /** Cosmetic-only (I3): Brassbound tool skin — shine, zero stats. */
      { id: 'brassTrim', output: 'cosmetic:brassToolSkin', bolts: 120, materials: { salvage: 10, brass: 30 } },
    ],
    /** Server-checked bench reach (chebyshev tiles). */
    benchRadiusTiles: 3,
  },

  /**
   * First combat slice (Game Bible B6/B7): feral Scuttlebots in the SE
   * scrap fringe. Weak, mischievous, telegraphed. Mobs drop NO Bolts and
   * NO stack loot — only the rare Manifest trophy roll below.
   */
  combat: {
    player: {
      maxHp: 30,
      attackDamage: 4,
      /** Chebyshev melee reach. */
      attackRangeTiles: 1,
      attackCooldownSeconds: 0.7,
      /** Regen inside the Great Dynamo's warmth (tiles from plaza center). */
      dynamoHealRadiusTiles: 5,
      dynamoHealPerSecond: 2.5,
      /** Downed Sparks come to in the Dynamo's warmth, not at the tram. */
      respawnTile: { x: 30, y: 34 },
    },
    scuttlebot: {
      count: 4,
      maxHp: 12,
      contactDamage: 2,
      moveSecondsPerTile: 0.34,
      /** Aggro when a Spark comes this close (chebyshev tiles). */
      aggroRadiusTiles: 3,
      /** Give up beyond this distance from home; trot back and reset. */
      leashRadiusTiles: 7,
      /** Wind-up telegraph before a bite lands. */
      windupSeconds: 0.6,
      attackCooldownSeconds: 1.5,
      respawnSeconds: 22,
      xpBrawlingPerKill: 14,
      /** Rare Manifest trophy roll per kill — the ONLY drop of any kind. */
      trophyChance: 0.04,
      /** Home range: the SE scrap fringe among the amperite spoil (W0
       *  layout). Pulled to the deep corner so the fringe's reach (leash 7
       *  from any home seat) clears the FIRST BOLTS gather pocket north of
       *  it — shared/tutorialPath.test.ts guards this line. */
      homeBox: { x0: 49, y0: 49, x1: 56, y1: 56 },
    },
    /** Placeable Heatlamp: riveted on the spot from Salvage (a real sink). */
    heatlamp: {
      costSalvage: 6,
      durationSeconds: 90,
      healPerSecond: 1.5,
      radiusTiles: 2,
      /** One active lamp per Spark; placing another is refused. */
      maxActivePerSpark: 1,
    },
  },

  /**
   * The Citywide Charge (Game Bible B9): weekly Amperite meter at the
   * Dynamo, Monday (UTC) reset, thresholds indexed to active players.
   * Rewards are REGALIA ONLY — no Bolts, nothing tradeable (load-bearing
   * for the token economy; see shared/charge.ts).
   */
  charge: {
    /** Amperite per active player for tiers 1/2/3. */
    tierPerActivePlayer: [15, 40, 90],
    /** Threshold floor: pretend at least this many Sparks are active. */
    minActivePlayers: 5,
    /** A character counts as active if seen within this many days. */
    activeWindowDays: 7,
    /** Weekend gather-XP bonus per tier reached (0.05 = +5%/tier). */
    weekendXpBonusPerTier: 0.05,
    /** Top weekly contributors who receive the name-glow trim. */
    topContributors: 10,
    /** The untradeable cosmetic id awarded to top contributors. */
    trimCosmetic: 'chargeTrim',
  },

  /** Skill Mastery 1-50 (Game Bible B3): fast early, long-horizon late. */
  mastery: {
    maxLevel: 50,
    /** XP from level 1 → 2; each next level costs curveGrowth× more. */
    curveBase: 40,
    curveGrowth: 1.135,
    /** XP granted per successful gather, by node kind. */
    xpByNode: {
      junkHeap: 10,
      brassSeam: 6, // per vein segment collected (see server)
      amperite: 5, // per strike
      glowkoi: 14,
      antenna: 16,
    },
    /** The modest gather-speed curve: -0.6%/level, floor at 75% of base. */
    speedPerLevel: 0.006,
    speedCap: 0.75,
    /** Breadth flags only (content arrives later); labels are UI previews. */
    unlocks: {
      scavving: {
        10: 'Rich heaps read at a glance',
        20: 'Derelict machine caches',
        30: 'Deep-fringe heap routes',
        40: 'Master scav marks',
      },
      delving: {
        10: 'Seam weather sense',
        20: 'Crystal lattice reading',
        30: 'Underworks side-galleries',
        40: 'Master delve marks',
      },
      skimming: {
        10: 'Koi shadow lore',
        20: 'Night-water casts',
        30: 'Deep-channel skimming',
        40: 'Master skim marks',
      },
      tuning: {
        10: 'Cleaner static',
        20: 'Old grid callsigns',
        30: 'Ghost-band access',
        40: 'Master tune marks',
      },
      brawling: {
        10: 'Sparyard stances',
        20: 'Junkbot weak points',
        30: 'Outskirt patrol routes',
        40: 'Master brawl marks',
      },
      griddling: {
        10: 'Warmcup basics',
        20: 'Skewer seasoning',
        30: 'Stall-worthy plating',
        40: 'Master griddle marks',
      },
    },
  },
} as const;

export type GameConfig = typeof CONFIG;
export type JunkHeapConfig = typeof CONFIG.gathering.junkHeap;
export type BrassSeamConfig = typeof CONFIG.gathering.brassSeam;
export type AmperiteConfig = typeof CONFIG.gathering.amperite;
export type GlowkoiConfig = typeof CONFIG.gathering.glowkoi;
export type AntennaConfig = typeof CONFIG.gathering.antenna;
export type ToolId = (typeof CONFIG.tools.starterHotbar)[number];
export type NodeKind = keyof typeof CONFIG.tools.requiredByNode;

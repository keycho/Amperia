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
    /** Map is size × size tiles. */
    size: 40,
    /** Seed for deterministic map decoration + node scatter. */
    seed: 20260709,
  },

  camera: {
    zoomMin: 0.5,
    zoomMax: 2,
    /** Multiplicative zoom step per wheel notch. */
    zoomStepFactor: 1.12,
    /** Pixels from viewport edge that trigger edge-pan. */
    edgePanMarginPx: 24,
    /** Edge-pan speed in world px/s (at zoom 1). */
    edgePanSpeed: 520,
    /** Lerp factor for camera follow (0–1, higher = snappier). */
    followLerp: 0.08,
    /** Extra world-px margin around the map the camera may show. */
    boundsMarginPx: 220,
  },

  player: {
    /** Seconds to walk one tile (A* path steps tween at this rate). */
    secondsPerTile: 0.21,
    /** Spawn tile (plaza, south of the Great Dynamo). */
    spawn: { x: 20, y: 24 },
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
      minNodeSpacing: 3,
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
    xMin: 4,
    xMax: 5,
    yMin: 5,
    yMax: 35,
    /** Rows where decking bridges the channel (walkable). */
    bridgeRows: [19, 20],
  },

  inventory: {
    slots: 24,
    stackMax: 999,
    hotbarSlots: 6,
  },

  chat: {
    /** Chebyshev tile radius reported by /near. */
    nearRadiusTiles: 8,
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

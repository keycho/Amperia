import { CONFIG } from '@shared/config';
import type { Inventory, InventorySlot } from '@shared/inventory';
import { fullDurability, makeInventory } from '@shared/inventory';
import { makeSkillXp, SKILLS, type SkillXp } from '@shared/mastery';
import { emptyStoryLog, type StoryLog } from '@shared/story';
import type { TilePoint } from '@shared/pathfinding';
import { prisma } from './db.js';

export interface CharacterSnapshot {
  sparkName: string;
  tile: TilePoint | null;
  pack: Inventory | null;
  hotbar: Inventory | null;
  skills: SkillXp;
  bolts: number;
  dailySaleBolts: number;
  dailySaleDate: string;
  /** U1a delivery daily cap counters (UTC-day rollover). */
  deliveryDayBolts: number;
  deliveryDayDate: string;
  /** U1b tending daily cap counters (UTC-day rollover). */
  tendDayCount: number;
  tendDayDate: string;
  /** Direct-trade guardrail counters (E1c) — UTC-day rollover. */
  tradeDayDate: string;
  tradeDayValueBolts: number;
  tradeDayCount: number;
  /** Account birth — young-account trade gates read this. */
  accountCreatedAtMs: number;
  quests: Record<string, unknown>;
  cosmetics: string[];
  district: string;
  /** Creator appearance code; '' = not chosen (first-login creator). */
  appearance: string;
  /** Worn wardrobe wire; '' = never set, 'none' = explicitly bare. */
  equipped: string;
  /** Untradeable Manifest titles, earn order. */
  titles: string[];
  /** Weekly-goal regalia tokens (S2). */
  goalTokens: number;
  /** Rested Charge (S3): gathering ms burned + which UTC day they belong to. */
  restedMsUsed: number;
  restedDate: string;
  /** S2 — the Long Dark story log. */
  story: StoryLog;
}

/** Parse a stored story log defensively — bad JSON = a fresh log. */
function parseStory(raw: unknown): StoryLog {
  const log = emptyStoryLog();
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return log;
  const rec = raw as Record<string, unknown>;
  if (rec['rodeTram'] === true) log.rodeTram = true;
  const ch = rec['chapters'];
  if (typeof ch === 'object' && ch !== null && !Array.isArray(ch)) {
    for (const [id, st] of Object.entries(ch as Record<string, unknown>)) {
      if (typeof st !== 'object' || st === null) continue;
      const s = st as Record<string, unknown>;
      if ((s['state'] === 'task' || s['state'] === 'done') && typeof s['progress'] === 'number') {
        log.chapters[id] = { state: s['state'], progress: Math.max(0, Math.floor(s['progress'])) };
      }
    }
  }
  return log;
}

function parseSkills(raw: unknown): SkillXp {
  const xp = makeSkillXp();
  if (typeof raw === 'object' && raw !== null) {
    for (const skill of SKILLS) {
      const v = (raw as Record<string, unknown>)[skill];
      if (typeof v === 'number' && v >= 0) xp[skill] = Math.floor(v);
    }
  }
  return xp;
}

function parseInventory(raw: unknown, slotCount: number): Inventory | null {
  if (!Array.isArray(raw)) return null;
  const inv = makeInventory(slotCount);
  for (let i = 0; i < slotCount; i++) {
    const s = raw[i] as InventorySlot | undefined;
    if (
      s !== null &&
      s !== undefined &&
      typeof s === 'object' &&
      typeof (s as { itemId?: unknown }).itemId === 'string' &&
      typeof (s as { qty?: unknown }).qty === 'number' &&
      (s as { qty: number }).qty > 0
    ) {
      const durability =
        typeof (s as { durability?: unknown }).durability === 'number'
          ? Math.max(0, Math.floor((s as { durability: number }).durability))
          : fullDurability(s.itemId);
      inv.slots[i] =
        durability === undefined
          ? { itemId: s.itemId, qty: Math.floor(s.qty) }
          : { itemId: s.itemId, qty: Math.floor(s.qty), durability };
    }
  }
  return inv;
}

export async function loadCharacter(characterId: string): Promise<CharacterSnapshot> {
  const c = await prisma.character.findUniqueOrThrow({
    where: { id: characterId },
    include: { account: { select: { createdAt: true } } },
  });
  const tile =
    typeof c.tileX === 'number' && typeof c.tileY === 'number' && c.tileX >= 0 && c.tileY >= 0
      ? { x: c.tileX, y: c.tileY }
      : null;
  return {
    sparkName: c.sparkName,
    tile,
    pack: parseInventory(c.packJson, CONFIG.inventory.slots),
    hotbar: parseInventory(c.hotbarJson, CONFIG.inventory.hotbarSlots),
    skills: parseSkills(c.skillsJson),
    bolts: c.bolts,
    dailySaleBolts: c.dailySaleBolts,
    dailySaleDate: c.dailySaleDate,
    deliveryDayBolts: c.deliveryDayBolts,
    deliveryDayDate: c.deliveryDayDate,
    tendDayCount: c.tendDayCount,
    tendDayDate: c.tendDayDate,
    tradeDayDate: c.tradeDayDate,
    tradeDayValueBolts: c.tradeDayValueBolts,
    tradeDayCount: c.tradeDayCount,
    accountCreatedAtMs: c.account.createdAt.getTime(),
    quests:
      typeof c.questsJson === 'object' && c.questsJson !== null && !Array.isArray(c.questsJson)
        ? (c.questsJson as Record<string, unknown>)
        : {},
    cosmetics: Array.isArray(c.cosmeticsJson)
      ? (c.cosmeticsJson as unknown[]).filter((v): v is string => typeof v === 'string')
      : [],
    district: c.district,
    appearance: c.appearance,
    equipped: c.equipped,
    titles: Array.isArray(c.titlesJson)
      ? (c.titlesJson as unknown[]).filter((v): v is string => typeof v === 'string')
      : [],
    goalTokens: c.goalTokens,
    restedMsUsed: c.restedMsUsed,
    restedDate: c.restedDate,
    story: parseStory(c.storyJson),
  };
}

export async function persistCharacter(
  characterId: string,
  data: {
    tile: TilePoint;
    pack: Inventory;
    hotbar: Inventory;
    skills: SkillXp;
    bolts: number;
    dailySaleBolts: number;
    dailySaleDate: string;
    deliveryDayBolts: number;
    deliveryDayDate: string;
    tendDayCount: number;
    tendDayDate: string;
    tradeDayDate: string;
    tradeDayValueBolts: number;
    tradeDayCount: number;
    quests: Record<string, unknown>;
    cosmetics: string[];
    district: string;
    equipped: string;
    titles: string[];
    restedMsUsed: number;
    restedDate: string;
    story: StoryLog;
  },
): Promise<void> {
  try {
    await prisma.character.update({
      where: { id: characterId },
      data: {
        tileX: data.tile.x,
        tileY: data.tile.y,
        packJson: data.pack.slots as object[],
        hotbarJson: data.hotbar.slots as object[],
        skillsJson: data.skills,
        bolts: data.bolts,
        dailySaleBolts: data.dailySaleBolts,
        dailySaleDate: data.dailySaleDate,
        deliveryDayBolts: data.deliveryDayBolts,
        deliveryDayDate: data.deliveryDayDate,
        tendDayCount: data.tendDayCount,
        tendDayDate: data.tendDayDate,
        tradeDayDate: data.tradeDayDate,
        tradeDayValueBolts: data.tradeDayValueBolts,
        tradeDayCount: data.tradeDayCount,
        questsJson: data.quests as object,
        cosmeticsJson: data.cosmetics,
        district: data.district,
        equipped: data.equipped,
        titlesJson: data.titles,
        restedMsUsed: data.restedMsUsed,
        restedDate: data.restedDate,
        storyJson: data.story as unknown as object,
      },
    });
  } catch (err) {
    console.error('[persistence] save failed for', characterId, err);
  }
}

/**
 * Creator confirm (I2): store the appearance code and (first login only)
 * the chosen Spark name. Returns an error string instead of throwing so the
 * room can bounce it to the client copy-safe.
 */
export async function saveIdentity(
  characterId: string,
  appearance: string,
  sparkName?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await prisma.character.update({
      where: { id: characterId },
      data: sparkName === undefined ? { appearance } : { appearance, sparkName },
    });
    return { ok: true };
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'P2002') return { ok: false, error: 'That name is already taken.' };
    return { ok: false, error: 'Could not save — try again in a moment.' };
  }
}

// ── City-life L4: Sparks who stay ──────────────────────────────────────────

export interface RestingRow {
  characterId: string;
  sparkName: string;
  tileX: number;
  tileY: number;
  appearance: string;
  equipped: string;
  restingPose: string;
  restingUntil: Date;
}

/** The district's resting Sparks whose naps haven't expired (capped). */
export async function loadResters(district: string, cap: number): Promise<RestingRow[]> {
  const rows = await prisma.character.findMany({
    where: { district, restingPose: { not: '' }, restingUntil: { gt: new Date() } },
    take: cap,
    select: {
      id: true,
      sparkName: true,
      tileX: true,
      tileY: true,
      appearance: true,
      equipped: true,
      restingPose: true,
      restingUntil: true,
    },
  });
  return rows
    .filter((r) => r.restingUntil !== null)
    .map((r) => ({
      characterId: r.id,
      sparkName: r.sparkName,
      tileX: r.tileX,
      tileY: r.tileY,
      appearance: r.appearance,
      equipped: r.equipped === 'none' ? '' : r.equipped,
      restingPose: r.restingPose,
      restingUntil: r.restingUntil as Date,
    }));
}

/** Mark a character resting in place (called at logout capture). */
export async function setResting(characterId: string, pose: string, until: Date): Promise<void> {
  await prisma.character.update({
    where: { id: characterId },
    data: { restingPose: pose, restingUntil: until },
  });
}

/** Clear the rest (the player came back, or the sweep expired it). */
export async function clearResting(characterId: string): Promise<void> {
  await prisma.character.update({
    where: { id: characterId },
    data: { restingPose: '', restingUntil: null },
  });
}

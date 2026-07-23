import Phaser from 'phaser';

/**
 * F4 — THE TEXT-OVERLAP AUDIT (window.__amperia.textAudit).
 *
 * Enumerates every visible text object across the active world + UI scenes
 * and reports its SCREEN bounding box, the opaque plate rect that owns it
 * (nearest tagged ancestor — kitPlate / kitChip / speech bubbles / the
 * E-prompt all declare a `kitClipRect`), and every visible opaque rect. The
 * Playwright tour asserts on this data: zero text↔text intersections (unless
 * a pair shares an explicit `overlapOk` tag), zero texts escaping their
 * plate, with fully-covered texts treated as hidden rather than colliding.
 *
 * Pure read — walks the display lists, mutates nothing, cheap enough to run
 * per tour state.
 */

export interface AuditRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AuditTextEntry {
  scene: 'world' | 'ui';
  /** First 48 chars — identification only. */
  text: string;
  box: AuditRect;
  /** Screen rect of the nearest tagged ancestor plate, when one exists. */
  clip: AuditRect | null;
  /** Pairs sharing a non-empty tag may overlap by design. */
  overlapOk: string | null;
  depth: number;
}

export interface AuditReport {
  texts: AuditTextEntry[];
  /** Every visible opaque plate rect (screen space) with its paint order. */
  plates: Array<AuditRect & { scene: 'world' | 'ui'; depth: number }>;
  viewport: { w: number; h: number };
}

interface ClipTag {
  ox: number;
  oy: number;
  w: number;
  h: number;
}

/** World rect → screen rect via the verified camera model (F1). */
function worldRectToScreen(cam: Phaser.Cameras.Scene2D.Camera, r: AuditRect): AuditRect {
  const cx = cam.scrollX + cam.width / 2;
  const cy = cam.scrollY + cam.height / 2;
  return {
    x: (r.x - cx) * cam.zoom + cam.width / 2,
    y: (r.y - cy) * cam.zoom + cam.height / 2,
    w: r.w * cam.zoom,
    h: r.h * cam.zoom,
  };
}

function clipRectOf(obj: Phaser.GameObjects.GameObject): AuditRect | null {
  const tag = obj.getData?.('kitClipRect') as ClipTag | undefined;
  if (tag === undefined) return null;
  const m = (obj as unknown as Phaser.GameObjects.Components.Transform).getWorldTransformMatrix();
  return {
    x: m.tx + tag.ox * m.scaleX,
    y: m.ty + tag.oy * m.scaleY,
    w: tag.w * m.scaleX,
    h: tag.h * m.scaleY,
  };
}

export function auditTexts(game: Phaser.Game): AuditReport {
  const texts: AuditTextEntry[] = [];
  const plates: AuditReport['plates'] = [];
  let viewport = { w: 0, h: 0 };

  for (const key of ['world', 'ui'] as const) {
    if (!game.scene.isActive(key)) continue;
    const scene = game.scene.getScene(key);
    const cam = scene.cameras.main;
    viewport = { w: cam.width, h: cam.height };
    const toScreen = (r: AuditRect): AuditRect => (key === 'world' ? worldRectToScreen(cam, r) : r);

    const walk = (
      obj: Phaser.GameObjects.GameObject,
      alpha: number,
      clip: AuditRect | null,
      rootDepth: number,
    ): void => {
      const vis = (obj as unknown as { visible?: boolean }).visible;
      if (vis === false) return;
      const a = alpha * ((obj as unknown as { alpha?: number }).alpha ?? 1);
      if (a <= 0.05) return;
      const depth = (obj as unknown as { depth?: number }).depth ?? rootDepth;

      // A tagged object declares an opaque plate: record it and it becomes
      // the clip for its own subtree (containers) or siblings' backdrop.
      const own = clipRectOf(obj);
      if (own !== null) {
        const sr = toScreen(own);
        plates.push({ ...sr, scene: key, depth });
      }

      if (obj instanceof Phaser.GameObjects.Container) {
        // A container owning a tagged plate child clips its whole subtree
        // (the child's own visit records the plate rect — no double entry).
        let childClip = clip;
        for (const ch of obj.list) {
          const r = clipRectOf(ch);
          if (r !== null) childClip = toScreen(r);
        }
        if (own !== null) childClip = toScreen(own);
        for (const ch of obj.list) walk(ch, a, childClip, depth);
        return;
      }

      if (obj instanceof Phaser.GameObjects.Text) {
        const t = obj;
        const raw = t.text.trim();
        if (raw === '') return;
        const b = t.getBounds();
        const box = toScreen({ x: b.x, y: b.y, w: b.width, h: b.height });
        // Off-screen text can't collide with anything a player sees.
        if (box.x + box.w < 0 || box.y + box.h < 0 || box.x > viewport.w || box.y > viewport.h) {
          return;
        }
        texts.push({
          scene: key,
          text: raw.slice(0, 48),
          box,
          clip,
          overlapOk: (t.getData('overlapOk') as string | undefined) ?? null,
          depth,
        });
      }
    };

    for (const obj of scene.children.list) walk(obj, 1, null, 0);
  }
  return { texts, plates, viewport };
}

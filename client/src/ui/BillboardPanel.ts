import Phaser from 'phaser';
import type { ChargeStateShape, CityPresenceEvent, MarketSyncEvent } from '@shared/protocol';
import { PALETTE, UI_TEXT_WARM } from '@shared/palette';
import { SERVER_URL } from '../net/NetClient';
import { session, SessionEvents } from '../net/session';
import { fmtChange24h, fmtCompactUsd, fmtCount, fmtPriceUsd } from './boardFormat';
import { HEADER_H, kitHeader, kitPanelPop, kitPlate, kitText, SPACE } from './kit';

const W = 380;

/**
 * THE CITY BOARD inspect panel (billboard T2): the same figures the plaza
 * ticker rotates through, laid out at once, with an honest "as of" line and
 * the City Ledger link. COMMS-CLEAN by construction: reporting only — no
 * "buy", no projection, no call to action, ever (T4).
 */
export class BillboardPanel {
  readonly container: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private lastH = 300;
  visible = false;
  private market: MarketSyncEvent | null = null;
  private sparks: number | null = null;
  private charge: { tier: number; tierMax: number } | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(1150);
    this.container.setVisible(false);
    session.events.on(SessionEvents.openBoard, () => this.setVisible(true));
    session.events.on(SessionEvents.marketSync, (e: MarketSyncEvent) => {
      this.market = e;
      if (this.visible) this.refresh();
    });
    session.events.on(SessionEvents.cityPresence, (e: CityPresenceEvent) => {
      this.sparks = Object.values(e.counts).reduce((a, b) => a + (b ?? 0), 0);
      if (this.visible) this.refresh();
    });
    session.events.on(SessionEvents.charge, (c: ChargeStateShape) => {
      this.charge = { tier: c.tier, tierMax: 3 };
      if (this.visible) this.refresh();
    });
  }

  pixelSize(): { w: number; h: number } {
    return { w: W, h: this.lastH };
  }

  setVisible(v: boolean): void {
    this.visible = v;
    if (v) {
      this.container.setVisible(true);
      this.refresh();
    }
    kitPanelPop(this.scene, this.container, { w: W, h: this.lastH }, v);
  }

  refresh(): void {
    this.container.removeAll(true);
    let y = HEADER_H + SPACE.sm;

    const line = (x: number, yy: number, text: string, color = UI_TEXT_WARM) => {
      const t = kitText(this.scene, x, yy, text, 'body', { color });
      this.container.add(t);
      return t;
    };
    const row = (label: string, value: string, tone = UI_TEXT_WARM) => {
      line(SPACE.md, y, label, PALETTE.groundAccent);
      const v = kitText(this.scene, W - SPACE.md, y, value, 'body', { color: tone, bold: true });
      v.setOrigin(1, 0);
      this.container.add(v);
      y += 24;
    };

    const blurb = line(
      SPACE.md,
      y,
      'The city, in figures. Reports only — nothing here sells.',
      PALETTE.groundAccent,
    );
    blurb.setWordWrapWidth(W - SPACE.md * 2);
    y += Math.ceil(blurb.height) + 10;

    const m = this.market;
    if (m !== null && m.live && m.priceUsd !== null) {
      const rose = m.change24hPct !== null && m.change24hPct < 0;
      row('$AMP', fmtPriceUsd(m.priceUsd), PALETTE.neonAmber);
      if (m.change24hPct !== null) {
        row('24h', fmtChange24h(m.change24hPct).replace('24H ', ''), rose ? PALETTE.neonRose : UI_TEXT_WARM);
      }
      if (m.marketCapUsd !== null) row('Market cap', fmtCompactUsd(m.marketCapUsd));
      if (m.burnedAmp !== null) row('Burned to date', `${fmtCount(m.burnedAmp)} $AMP`);
      const asOf = new Date(m.asOfMs).toISOString().slice(11, 16);
      line(SPACE.md, y, `as of ${asOf} UTC — figures rest when the feed does`, PALETTE.groundAccent);
      y += 22;
    } else if (m !== null && !m.configured) {
      row('The ticker', 'wakes at launch', PALETTE.warmGlow);
    } else {
      row('The ticker', 'resting', PALETTE.groundAccent);
    }

    y += 4;
    if (this.sparks !== null) row('Sparks in the city', fmtCount(this.sparks), PALETTE.warmGlow);
    if (this.charge !== null) {
      row(
        'Citywide Charge',
        this.charge.tier <= 0 ? 'unlit' : `tier ${this.charge.tier} of ${this.charge.tierMax}`,
        PALETTE.warmGlow,
      );
    }

    y += 6;
    // The City Ledger link — the Ledgerhouse pattern, same label, same rail.
    const link = kitText(this.scene, SPACE.md, y, 'City Ledger ↗', 'caption', {
      color: PALETTE.neonAmber,
    });
    link.setInteractive({ useHandCursor: true });
    link.on('pointerover', () => link.setColor(PALETTE.warmGlow));
    link.on('pointerout', () => link.setColor(PALETTE.neonAmber));
    link.on(
      'pointerdown',
      (_p: unknown, _x: unknown, _y: unknown, ev: Phaser.Types.Input.EventData) => {
        ev.stopPropagation();
        window.open(`${SERVER_URL}/ledger`, '_blank', 'noopener');
      },
    );
    this.container.add(link);
    y += 22;

    this.lastH = y + SPACE.md;
    this.container.addAt(kitPlate(this.scene, W, this.lastH), 0);
    kitHeader(this.scene, this.container, W, 'THE CITY BOARD', () => this.setVisible(false));
    const cam = this.scene.cameras.main;
    this.container.setPosition(
      Math.round((cam.width - W) / 2),
      Math.round(Math.max(30, (cam.height - this.lastH) / 2 - 10)),
    );
  }
}

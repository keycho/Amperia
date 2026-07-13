import Phaser from 'phaser';
import { PALETTE, UI_TEXT_WARM } from '@shared/palette';
import { sound } from '../audio/sound';
import { HEADER_H, kitButton, kitHeader, kitPlate, kitText, SPACE, type TypeLevel } from './kit';

const W = 560;
const H = 400;
const SEEN_KEY = 'amperia.howtoplay.seen';

interface Card {
  title: string;
  lines: string[];
}

/**
 * HOW TO PLAY (H1): four cards in the city's voice, shown once after the
 * creator (skippable at every step) and reopenable from the [?] HUD
 * button. Copy follows the comms rules — prizes are prizes, rewards are
 * rewards, nothing "earns" and nothing "yields".
 */
const CARDS: Card[] = [
  {
    title: 'MOVE & GATHER',
    lines: [
      'Click anywhere to walk — your Spark finds the way.',
      'Click a glowing node to work it: junk heaps, brass',
      'seams, koi shadows, antenna masts.',
      '',
      'Watch for the glint and the pulse while you work.',
      'Attention pays.',
    ],
  },
  {
    title: 'YOUR TOOLS & TRADES',
    lines: [
      'The hotbar is your tool belt — Magclaw, Drillhammer,',
      'Skimnet, Tuner, Riveter. The right tool must be in',
      'hand (keys 1–6).',
      '',
      'Five gathering trades plus Tuning, each with Mastery',
      '1–50 (K). Working a node levels its trade.',
      '',
      'The Tinkerbench crafts gear and mends what breaks —',
      'broken tools are never lost.',
    ],
  },
  {
    title: 'THE CITY WORKS',
    lines: [
      'The goal board (G) turns weekly — claim rewards on',
      'any five. The Fortune Coil spins free once a day:',
      'cosmetic prizes, nothing else.',
      '',
      'The Nightstalls: sell to the merchant, rent a shop',
      'stall, or trade Spark to Spark (/trade <name>).',
      '',
      'The Ledgerhouse keeps Bolts safe behind the counter.',
      'Feeding the Dynamo Amperite raises the Citywide',
      'Charge — the whole city glows for it.',
    ],
  },
  {
    title: 'THE TANGLE BITES',
    lines: [
      'Dangerous districts play for keeps: fall out there',
      'and your carried resources and Bolts drop into a',
      'Scrapcache at your boots.',
      '',
      'Bank first. Travel light. Run back fast — the cache',
      'waits for its owner, but not forever.',
      '',
      'Equipped tools never drop. The Filament is always',
      'safe ground.',
    ],
  },
];

export class HowToPlayPanel {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly dynamic: Phaser.GameObjects.GameObject[] = [];
  private card = 0;
  visible = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(1200);
    this.container.setVisible(false);
    this.container.add(kitPlate(scene, W, H));
    kitHeader(scene, this.container, W, 'HOW THE CITY WORKS', () => this.setVisible(false));
  }

  /** Auto-show for brand-new Sparks (once — the [?] button remains). */
  maybeShowFirstTime(): void {
    if (localStorage.getItem(SEEN_KEY) === '1') return;
    this.open(0);
  }

  toggle(): void {
    if (this.visible) this.setVisible(false);
    else this.open(0);
  }

  open(card: number): void {
    this.card = card;
    this.setVisible(true);
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.container.setVisible(v);
    if (v) {
      const cam = this.scene.cameras.main;
      this.container.setPosition(
        Math.round((cam.width - W) / 2),
        Math.round((cam.height - H) / 2),
      );
      this.refresh();
    } else {
      localStorage.setItem(SEEN_KEY, '1');
    }
  }

  private text(x: number, y: number, body: string, color: string, level: TypeLevel = 'body', bold = false) {
    const t = kitText(this.scene, x, y, body, level, { color, bold });
    t.setLineSpacing(5);
    this.container.add(t);
    this.dynamic.push(t);
    return t;
  }

  private button(
    x: number,
    y: number,
    label: string,
    opts: { width?: number; primary?: boolean },
    onClick: () => void,
  ) {
    const b = kitButton(this.scene, x, y, label, {
      width: opts.width,
      height: 28,
      primary: opts.primary,
      onClick: () => {
        sound.uiClick();
        onClick();
      },
    });
    this.container.add(b);
    this.dynamic.push(b);
    return b;
  }

  private refresh(): void {
    for (const o of this.dynamic) o.destroy();
    this.dynamic.length = 0;
    const c = CARDS[this.card] as Card;

    this.text(SPACE.lg, HEADER_H + SPACE.sm, c.title, PALETTE.neonAmber, 'heading', true);
    this.text(SPACE.lg, 88, c.lines.join('\n'), UI_TEXT_WARM, 'body');

    // Card dots — where you are in the four breaths.
    CARDS.forEach((_c2, i) => {
      const dot = this.text(
        SPACE.lg + i * 22,
        H - 44,
        '●',
        i === this.card ? PALETTE.neonAmber : PALETTE.groundAccent,
        'body',
      );
      dot.setAlpha(i === this.card ? 1 : 0.5);
    });

    const last = this.card === CARDS.length - 1;
    const by = H - 46;
    let rx = W - SPACE.md;

    const primaryW = 96;
    rx -= primaryW;
    this.button(rx, by, last ? 'got it' : 'next ▸', { width: primaryW, primary: true }, () => {
      if (last) this.setVisible(false);
      else {
        this.card += 1;
        this.refresh();
      }
    });
    rx -= SPACE.sm;
    if (this.card > 0) {
      const backW = 48;
      rx -= backW;
      this.button(rx, by, '◂', { width: backW }, () => {
        this.card -= 1;
        this.refresh();
      });
      rx -= SPACE.sm;
    }
    if (!last) {
      const skipW = 72;
      rx -= skipW;
      this.button(rx, by, 'skip', { width: skipW }, () => this.setVisible(false));
    }

    // A warm footer beat so the panel sits in the world's voice.
    this.text(SPACE.lg, H - 24, 'reopen anytime with the [?] button', PALETTE.groundAccent, 'caption');
  }
}

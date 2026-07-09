import Phaser from 'phaser';
import { CHAT_LIMITS, type ChatBroadcast } from '@shared/protocol';
import { intToHex, mixPalette, PALETTE, PALETTE_INT, UI_TEXT_WARM } from '@shared/palette';
import { send } from '../net/NetClient';
import { session, SessionEvents } from '../net/session';

const MAX_LINES = 8;

/**
 * Bottom-left chat: a warm message log (Phaser) + a DOM input that appears on
 * Enter (canvas text input is miserable). Esc hides; Enter sends.
 */
export class ChatUI {
  private readonly scene: Phaser.Scene;
  private readonly lines: Phaser.GameObjects.Text[] = [];
  private readonly hint: Phaser.GameObjects.Text;
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly log: ChatBroadcast[] = [];
  private input: HTMLInputElement | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.bg = scene.add.graphics();
    this.bg.setDepth(890);
    for (let i = 0; i < MAX_LINES; i++) {
      const t = scene.add.text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: UI_TEXT_WARM,
        stroke: PALETTE.ink,
        strokeThickness: 3,
      });
      t.setDepth(891);
      this.lines.push(t);
    }
    this.hint = scene.add.text(0, 0, '[Enter] to chat', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: PALETTE.warmGlow,
    });
    this.hint.setAlpha(0.65);
    this.hint.setDepth(891);

    session.events.on(SessionEvents.chat, (m: ChatBroadcast) => this.push(m));
    session.events.on(SessionEvents.notice, (text: string) =>
      this.push({ from: '⚡', text, ts: Date.now() }),
    );
    this.layout();
  }

  get typing(): boolean {
    return this.input !== null;
  }

  layout(): void {
    const h = this.scene.scale.height;
    const x = 12;
    const y = h - 40;
    for (let i = 0; i < MAX_LINES; i++) {
      const line = this.lines[MAX_LINES - 1 - i];
      if (line === undefined) continue;
      line.setPosition(x, y - 18 * i);
    }
    this.hint.setPosition(x, h - 20);
    this.redrawBg();
  }

  private redrawBg(): void {
    const h = this.scene.scale.height;
    this.bg.clear();
    if (this.log.length === 0) return;
    const height = Math.min(this.log.length, MAX_LINES) * 18 + 8;
    this.bg.fillStyle(PALETTE_INT.ink, 0.35);
    this.bg.fillRoundedRect(6, h - 44 - height + 14, 340, height, 8);
  }

  private push(m: ChatBroadcast): void {
    this.log.push(m);
    if (this.log.length > 50) this.log.shift();
    const recent = this.log.slice(-MAX_LINES);
    for (let i = 0; i < MAX_LINES; i++) {
      const line = this.lines[i];
      const msg = recent[i];
      if (line === undefined) continue;
      line.setText(msg === undefined ? '' : `${msg.from}: ${msg.text}`);
    }
    this.redrawBg();
  }

  /** Open the DOM input (called on Enter). */
  openInput(): void {
    if (this.input !== null) {
      this.input.focus();
      return;
    }
    const el = document.createElement('input');
    el.type = 'text';
    el.maxLength = CHAT_LIMITS.maxLength;
    el.placeholder = 'say something warm…';
    el.style.cssText = [
      'position:fixed',
      'left:10px',
      'bottom:8px',
      'width:330px',
      'padding:8px 10px',
      `background:${PALETTE.ink}`,
      `color:${UI_TEXT_WARM}`,
      `border:1px solid ${intToHex(mixPalette('groundBase', 'warmGlow', 0.3))}`,
      'border-radius:8px',
      'font-family:monospace',
      'font-size:13px',
      'outline:none',
      'z-index:20',
    ].join(';');
    el.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const text = el.value.trim();
        if (text !== '' && session.room !== null) {
          send.chat(session.room, { text });
        }
        this.closeInput();
      } else if (e.key === 'Escape') {
        this.closeInput();
      }
    };
    document.body.append(el);
    el.focus();
    this.input = el;
    this.hint.setVisible(false);
  }

  closeInput(): void {
    this.input?.remove();
    this.input = null;
    this.hint.setVisible(true);
  }
}

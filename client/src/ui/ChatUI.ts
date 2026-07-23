import Phaser from 'phaser';
import { CHAT_LIMITS, type ChatBroadcast } from '@shared/protocol';
import { intToHex, mixPalette, PALETTE, UI_TEXT_WARM } from '@shared/palette';
import { send } from '../net/NetClient';
import { session, SessionEvents } from '../net/session';
import { swallowGameInput } from './domGuard';
import { kitText, UIK } from './kit';

// R6/R6b: the bottom-left is PLAYERS-ONLY now (system messages moved to the
// top-center toast pills), capped at 2 visible lines that fade when quiet.
const MAX_LINES = 2;
const FADE_AFTER_MS = 9000;

/**
 * Bottom-left chat: a warm PLAYER message log (Phaser) + a DOM input that
 * appears on Enter (canvas text input is miserable). Esc hides; Enter sends.
 * System notices never appear here — they are top-center pills.
 */
export class ChatUI {
  private readonly scene: Phaser.Scene;
  private readonly lines: Phaser.GameObjects.Text[] = [];
  private readonly hint: Phaser.GameObjects.Text;
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly log: ChatBroadcast[] = [];
  /** What each visible line currently shows (click-to-whisper, U4c). */
  private recent: (ChatBroadcast | undefined)[] = [];
  /** Whispers that landed while the input was closed. */
  private unread = 0;
  private input: HTMLInputElement | null = null;
  private fadeEvent?: Phaser.Time.TimerEvent;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.bg = scene.add.graphics();
    this.bg.setDepth(890);
    for (let i = 0; i < MAX_LINES; i++) {
      const t = kitText(scene, 0, 0, '', 'body', { color: UI_TEXT_WARM });
      t.setStroke(PALETTE.ink, 3);
      t.setDepth(891);
      // U4c: click a name to whisper back — prefills /w <name>.
      const idx = i;
      t.setInteractive({ useHandCursor: true });
      // F5 hover: a whisperable line warms under the pointer (color, not
      // alpha — the idle fade owns alpha and must keep it).
      t.on('pointerover', () => {
        const m = this.recent[idx];
        if (m !== undefined && m.sessionId !== '' && m.sessionId !== session.room?.sessionId)
          t.setColor(PALETTE.warmGlow);
      });
      t.on('pointerout', () => t.setColor(UI_TEXT_WARM));
      t.on('pointerdown', () => {
        const m = this.recent[idx];
        if (m === undefined || m.sessionId === '' || m.sessionId === session.room?.sessionId)
          return;
        this.openInput(`/w ${m.from} `);
      });
      this.lines.push(t);
    }
    this.hint = kitText(scene, 0, 0, '[Enter] to chat', 'caption', { color: PALETTE.warmGlow });
    this.hint.setAlpha(0.65);
    this.hint.setDepth(891);

    // Players only — SessionEvents.notice is handled by the toast pills.
    session.events.on(SessionEvents.chat, (m: ChatBroadcast) => this.push(m));
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
    this.bg.fillStyle(UIK.plate, 0.4);
    this.bg.fillRoundedRect(6, h - 44 - height + 14, 340, height, 8);
  }

  private push(m: ChatBroadcast): void {
    this.log.push(m);
    if (this.log.length > 50) this.log.shift();
    if (
      m.whisperTo !== undefined &&
      m.sessionId !== session.room?.sessionId &&
      this.input === null
    ) {
      this.unread += 1;
      this.refreshHint();
    }
    this.recent = this.log.slice(-MAX_LINES);
    for (let i = 0; i < MAX_LINES; i++) {
      const line = this.lines[i];
      const msg = this.recent[i];
      if (line === undefined) continue;
      if (msg === undefined) {
        line.setText('');
        continue;
      }
      if (msg.whisperTo !== undefined) {
        const own = msg.sessionId === session.room?.sessionId;
        line.setText(own ? `to ${msg.whisperTo} ✉ ${msg.text}` : `${msg.from} ✉ ${msg.text}`);
        line.setColor(PALETTE.violetNeon);
      } else {
        line.setText(`${msg.from}: ${msg.text}`);
        line.setColor(UI_TEXT_WARM);
      }
    }
    this.redrawBg();
    this.wake();
  }

  /** Show the log full-strength, then fade it out again once chat goes quiet. */
  private wake(): void {
    const targets = [...this.lines, this.bg];
    this.scene.tweens.killTweensOf(targets);
    for (const t of targets) t.setAlpha(1);
    this.fadeEvent?.remove();
    this.fadeEvent = this.scene.time.delayedCall(FADE_AFTER_MS, () => {
      if (this.input !== null) return; // never fade while typing
      this.scene.tweens.add({ targets, alpha: 0, duration: 1200, ease: 'quad.in' });
    });
  }

  /** U4c: the hint doubles as the unread-whisper indicator. */
  private refreshHint(): void {
    if (this.unread > 0) {
      this.hint.setText(`[Enter] to chat · ✉ ${this.unread}`);
      this.hint.setColor(PALETTE.violetNeon);
      this.hint.setAlpha(1);
    } else {
      this.hint.setText('[Enter] to chat');
      this.hint.setColor(PALETTE.warmGlow);
      this.hint.setAlpha(0.65);
    }
  }

  /** Open the DOM input (called on Enter; prefill = click-to-whisper). */
  openInput(prefill?: string): void {
    this.unread = 0;
    this.refreshHint();
    this.wake();
    if (this.input !== null) {
      if (prefill !== undefined) this.input.value = prefill;
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
    swallowGameInput(el);
    el.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const text = el.value.trim();
        if (text === '/wardrobe') {
          // Client-side command: reopen the (limited) creator.
          session.events.emit(SessionEvents.openWardrobe);
        } else if (text !== '' && session.room !== null) {
          send.chat(session.room, { text });
        }
        this.closeInput();
      } else if (e.key === 'Escape') {
        this.closeInput();
      }
    };
    if (prefill !== undefined) el.value = prefill;
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

import { PALETTE, UI_TEXT_WARM } from '@shared/palette';
import { auth, type AuthResponse } from '../net/NetClient';
import { VERSION } from '../version';
import { sound } from '../audio/sound';
import { swallowGameInput } from './domGuard';

/**
 * THE TITLE SCREEN (U3a) — the first thing every player and stream sees.
 * The city poster pans slowly behind the wordmark; "Enter the City"
 * reveals the account form (email-first, guest always open — a wallet is
 * never required, CLAUDE.md). All colors from the locked palette.
 */
export function showLoginOverlay(): Promise<AuthResponse> {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.id = 'amperia-login';
    root.style.cssText = [
      'position:fixed',
      'inset:0',
      'overflow:hidden',
      'z-index:10',
      'font-family:monospace',
      `background:${PALETTE.ink}`,
    ].join(';');
    swallowGameInput(root);

    // The city, drifting — a slow Ken Burns over the launch poster.
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      @keyframes amperia-drift {
        0% { transform: scale(1.04) translate(0, 0); }
        50% { transform: scale(1.12) translate(-1.6%, -1.2%); }
        100% { transform: scale(1.04) translate(0, 0); }
      }
      @keyframes amperia-glowpulse {
        0%, 100% { text-shadow: 0 0 28px rgba(255,178,102,0.85), 0 0 80px rgba(255,178,102,0.35); }
        50% { text-shadow: 0 0 40px rgba(255,178,102,1), 0 0 110px rgba(255,178,102,0.5); }
      }
      #amperia-login .form-in { animation: amperia-formin .35s ease-out; }
      @keyframes amperia-formin {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `;
    const bg = document.createElement('div');
    bg.style.cssText = [
      'position:absolute',
      'inset:0',
      "background:url('/title-bg.jpg') center/cover no-repeat",
      'animation:amperia-drift 40s ease-in-out infinite',
    ].join(';');
    const shade = document.createElement('div');
    shade.style.cssText = [
      'position:absolute',
      'inset:0',
      `background:radial-gradient(ellipse at 50% 42%, transparent 30%, ${PALETTE.ink}E6 100%)`,
    ].join(';');
    // The poster carries its own wordmark near the base — fade it out so
    // the title screen speaks once.
    const floor = document.createElement('div');
    floor.style.cssText = [
      'position:absolute',
      'left:0',
      'right:0',
      'bottom:0',
      'height:26%',
      `background:linear-gradient(to bottom, transparent, ${PALETTE.ink} 78%)`,
    ].join(';');

    const center = document.createElement('div');
    center.style.cssText = [
      'position:absolute',
      'inset:0',
      'display:flex',
      'flex-direction:column',
      'align-items:center',
      'justify-content:center',
      'gap:14px',
    ].join(';');

    const title = document.createElement('div');
    title.textContent = 'AMPERIA';
    title.style.cssText = [
      `color:${PALETTE.warmGlow}`,
      'font-size:72px',
      'font-weight:bold',
      'letter-spacing:26px',
      'text-indent:26px',
      'animation:amperia-glowpulse 5s ease-in-out infinite',
    ].join(';');
    const sub = document.createElement('div');
    sub.textContent = 'one city in the dark — keep it lit';
    sub.style.cssText = `color:${UI_TEXT_WARM};opacity:.85;font-size:14px;letter-spacing:4px;margin-top:-8px;`;

    const enterBtn = document.createElement('button');
    enterBtn.textContent = 'Enter the City';
    enterBtn.style.cssText = [
      'margin-top:22px',
      'padding:14px 44px',
      `background:${PALETTE.neonAmber}`,
      `color:${PALETTE.ink}`,
      'border:none',
      'border-radius:10px',
      'font-family:monospace',
      'font-size:17px',
      'font-weight:bold',
      'letter-spacing:2px',
      'cursor:pointer',
      'box-shadow:0 0 30px rgba(255,178,102,0.45)',
    ].join(';');

    // ── the account form (hidden until Enter) ──────────────────────────────
    const panel = document.createElement('div');
    panel.style.cssText = [
      `background:${PALETTE.structureMid}F2`,
      `border:2px solid ${PALETTE.ink}`,
      'border-radius:14px',
      'padding:24px 26px',
      'width:320px',
      'box-shadow:0 12px 40px rgba(0,0,0,0.5)',
      'display:none',
    ].join(';');

    const msg = document.createElement('div');
    msg.style.cssText = `color:${PALETTE.neonRose};font-size:12px;min-height:16px;margin-bottom:8px;text-align:center;`;

    const input = (placeholder: string, type = 'text') => {
      const el = document.createElement('input');
      el.type = type;
      el.placeholder = placeholder;
      el.style.cssText = [
        'display:block',
        'width:100%',
        'box-sizing:border-box',
        'margin-bottom:10px',
        'padding:9px 10px',
        `background:${PALETTE.ink}`,
        `color:${UI_TEXT_WARM}`,
        `border:1px solid ${PALETTE.groundBase}`,
        'border-radius:8px',
        'font-family:monospace',
        'font-size:13px',
        'outline:none',
      ].join(';');
      return el;
    };

    const email = input('email', 'email');
    const password = input('password (8+)', 'password');
    const sparkName = input('Spark name (for new accounts)');

    const button = (label: string, primary: boolean) => {
      const el = document.createElement('button');
      el.textContent = label;
      el.style.cssText = [
        'display:block',
        'width:100%',
        'margin-top:8px',
        'padding:10px',
        `background:${primary ? PALETTE.neonAmber : PALETTE.ink}`,
        `color:${primary ? PALETTE.ink : UI_TEXT_WARM}`,
        'border:none',
        'border-radius:8px',
        'font-family:monospace',
        'font-size:14px',
        'font-weight:bold',
        'cursor:pointer',
      ].join(';');
      return el;
    };

    const loginBtn = button('Sign in', true);
    const registerBtn = button('Register a new Spark', false);
    const guestBtn = button('Wander in as a guest', false);

    const busy = (b: boolean) => {
      for (const el of [loginBtn, registerBtn, guestBtn]) el.disabled = b;
      root.style.cursor = b ? 'progress' : 'default';
    };
    const finish = (r: AuthResponse) => {
      root.remove();
      styleEl.remove();
      resolve(r);
    };
    const fail = (err: unknown) => {
      msg.textContent = err instanceof Error ? err.message : 'Something sputtered. Try again.';
      busy(false);
    };

    loginBtn.onclick = () => {
      busy(true);
      auth.login(email.value, password.value).then(finish, fail);
    };
    registerBtn.onclick = () => {
      busy(true);
      auth.register(email.value, password.value, sparkName.value).then(finish, fail);
    };
    guestBtn.onclick = () => {
      busy(true);
      auth.guest(sparkName.value.trim() === '' ? undefined : sparkName.value).then(finish, fail);
    };
    password.onkeydown = (e) => {
      if (e.key === 'Enter') loginBtn.click();
    };

    enterBtn.onclick = () => {
      sound.uiClick();
      enterBtn.style.display = 'none';
      panel.style.display = 'block';
      panel.classList.add('form-in');
      email.focus();
    };

    panel.append(msg, email, password, sparkName, loginBtn, registerBtn, guestBtn);

    // ── chrome: version tag + a small title-screen settings gear ──────────
    const version = document.createElement('div');
    version.textContent = VERSION;
    version.style.cssText = `position:absolute;right:14px;bottom:12px;color:${UI_TEXT_WARM};opacity:.55;font-size:11px;letter-spacing:1px;`;

    const gear = document.createElement('button');
    gear.textContent = '⚙';
    gear.title = 'settings';
    gear.style.cssText = [
      'position:absolute',
      'left:14px',
      'bottom:10px',
      'background:none',
      'border:none',
      `color:${UI_TEXT_WARM}`,
      'opacity:.7',
      'font-size:18px',
      'cursor:pointer',
    ].join(';');
    const gearPanel = document.createElement('div');
    gearPanel.style.cssText = [
      'position:absolute',
      'left:14px',
      'bottom:44px',
      `background:${PALETTE.structureMid}F2`,
      `border:1px solid ${PALETTE.ink}`,
      'border-radius:10px',
      'padding:12px 14px',
      'display:none',
      `color:${UI_TEXT_WARM}`,
      'font-size:12px',
    ].join(';');
    const volLabel = document.createElement('div');
    volLabel.textContent = 'sound';
    volLabel.style.cssText = 'margin-bottom:6px;opacity:.8;';
    const vol = document.createElement('input');
    vol.type = 'range';
    vol.min = '0';
    vol.max = '1';
    vol.step = '0.05';
    vol.value = String(sound.volume);
    vol.oninput = () => sound.setVolume(Number(vol.value));
    gearPanel.append(volLabel, vol);
    gear.onclick = () => {
      gearPanel.style.display = gearPanel.style.display === 'none' ? 'block' : 'none';
    };

    center.append(title, sub, enterBtn, panel);
    root.append(bg, shade, floor, center, gear, gearPanel, version);
    document.head.append(styleEl);
    document.body.append(root);
  });
}

import { PALETTE, UI_TEXT_WARM } from '@shared/palette';
import { auth, type AuthResponse } from '../net/NetClient';

/**
 * DOM login overlay (canvas text inputs are miserable). Email-first accounts;
 * guest entry keeps the funnel wide — a wallet is never required (CLAUDE.md).
 * All colors come from the locked palette.
 */
export function showLoginOverlay(): Promise<AuthResponse> {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.id = 'amperia-login';
    root.style.cssText = [
      'position:fixed',
      'inset:0',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      `background:${PALETTE.duskSky}CC`,
      'z-index:10',
      'font-family:monospace',
    ].join(';');

    const panel = document.createElement('div');
    panel.style.cssText = [
      `background:${PALETTE.structureMid}`,
      `border:2px solid ${PALETTE.ink}`,
      'border-radius:14px',
      'padding:28px 30px',
      'width:320px',
      'box-shadow:0 12px 40px rgba(0,0,0,0.35)',
    ].join(';');

    const title = document.createElement('div');
    title.textContent = 'AMPERIA';
    title.style.cssText = `color:${PALETTE.neonAmber};font-size:28px;font-weight:bold;letter-spacing:3px;text-align:center;`;
    const sub = document.createElement('div');
    sub.textContent = 'keep the city lit';
    sub.style.cssText = `color:${UI_TEXT_WARM};opacity:.8;font-size:12px;text-align:center;margin-bottom:18px;`;

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

    const loginBtn = button('Enter the city', true);
    const registerBtn = button('Register a new Spark', false);
    const guestBtn = button('Wander in as a guest', false);

    const busy = (b: boolean) => {
      for (const el of [loginBtn, registerBtn, guestBtn]) el.disabled = b;
      root.style.cursor = b ? 'progress' : 'default';
    };

    const finish = (r: AuthResponse) => {
      root.remove();
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

    panel.append(title, sub, msg, email, password, sparkName, loginBtn, registerBtn, guestBtn);
    root.append(panel);
    document.body.append(root);
    email.focus();
  });
}

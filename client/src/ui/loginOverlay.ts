import { PALETTE, UI_TEXT_WARM } from '@shared/palette';
import { SERVER_URL, type AuthResponse } from '../net/NetClient';
import { connectWallet, hasWallet, WalletRejectedError } from '../net/wallet';
import { VERSION } from '../version';
import { sound } from '../audio/sound';
import { swallowGameInput } from './domGuard';

/**
 * The result of the title screen: either a wallet sign-in, or a choice to
 * spectate the city read-only (W7).
 */
export type TitleChoice = { kind: 'auth'; auth: AuthResponse } | { kind: 'spectate' };

/**
 * THE TITLE SCREEN (U3a) — the first thing every player and stream sees.
 * The city poster pans slowly behind the wordmark. The way in is
 * "Connect Wallet to play" (wallet-only auth, W5); "Spectate the city" enters
 * read-only with no wallet (W7). No email, no password, no playable guest. All
 * colors from the locked palette; copy obeys the comms rules (never "earn").
 */
export function showLoginOverlay(): Promise<TitleChoice> {
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

    // The hero band: the wordmark + tagline ride UP in the dark void above
    // the islands, never over the Dynamo's glow. Its own dark scrim keeps the
    // text clean against ink like the landing-page hero.
    const hero = document.createElement('div');
    hero.style.cssText = [
      'position:absolute',
      'left:0',
      'right:0',
      'top:0',
      'height:46%',
      'display:flex',
      'flex-direction:column',
      'align-items:center',
      'justify-content:center',
      'gap:10px',
      'pointer-events:none',
    ].join(';');
    const heroScrim = document.createElement('div');
    heroScrim.style.cssText = [
      'position:absolute',
      'left:50%',
      'top:52%',
      'transform:translate(-50%,-50%)',
      'width:1240px',
      'max-width:94%',
      'height:440px',
      `background:radial-gradient(ellipse 52% 48% at 50% 50%, ${PALETTE.ink}F7 0%, ${PALETTE.ink}E6 46%, transparent 78%)`,
      'pointer-events:none',
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
      'font-size:78px',
      'font-weight:bold',
      'letter-spacing:24px',
      'text-indent:24px',
      `-webkit-text-stroke:4px ${PALETTE.ink}`,
      'paint-order:stroke fill',
      'position:relative',
      'animation:amperia-glowpulse 5s ease-in-out infinite',
    ].join(';');
    const sub = document.createElement('div');
    sub.textContent = 'one city in the dark — keep it lit';
    sub.style.cssText = [
      'position:relative',
      `color:${PALETTE.warmGlow}`,
      'opacity:1',
      'font-size:16px',
      'font-weight:bold',
      'letter-spacing:5px',
      'margin-top:4px',
      `text-shadow:1px 1px 0 ${PALETTE.ink},-1px 1px 0 ${PALETTE.ink},1px -1px 0 ${PALETTE.ink},-1px -1px 0 ${PALETTE.ink},0 2px 10px ${PALETTE.ink}`,
    ].join(';');

    // ── the ONE way in: Connect Wallet ────────────────────────────────────
    const connectBtn = document.createElement('button');
    connectBtn.textContent = 'Connect Wallet to play';
    connectBtn.style.cssText = [
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

    const msg = document.createElement('div');
    msg.style.cssText = [
      `color:${PALETTE.neonRose}`,
      'font-size:13px',
      'min-height:18px',
      'margin-top:12px',
      'text-align:center',
      'max-width:420px',
    ].join(';');

    // A quiet helper line under the button (comms-clean).
    const hint = document.createElement('div');
    hint.textContent = hasWallet()
      ? 'Sign in with your wallet — it moves no funds.'
      : 'Install a browser wallet (e.g. MetaMask) to play.';
    hint.style.cssText = [
      `color:${UI_TEXT_WARM}`,
      'opacity:.7',
      'font-size:12px',
      'letter-spacing:1px',
      'margin-top:8px',
      'text-align:center',
    ].join(';');

    // ── the no-wallet option: spectate the city, read-only ────────────────
    const spectateBtn = document.createElement('button');
    spectateBtn.textContent = 'Spectate the city';
    spectateBtn.style.cssText = [
      'margin-top:12px',
      'padding:9px 22px',
      'background:transparent',
      `color:${UI_TEXT_WARM}`,
      `border:1px solid ${PALETTE.groundBase}`,
      'border-radius:9px',
      'font-family:monospace',
      'font-size:13px',
      'letter-spacing:1px',
      'cursor:pointer',
      'opacity:.9',
    ].join(';');

    const close = (): void => {
      root.remove();
      styleEl.remove();
    };
    const finish = (r: AuthResponse): void => {
      close();
      resolve({ kind: 'auth', auth: r });
    };
    const busy = (b: boolean): void => {
      connectBtn.disabled = b;
      spectateBtn.disabled = b;
      connectBtn.textContent = b ? 'Connecting…' : 'Connect Wallet to play';
      root.style.cursor = b ? 'progress' : 'default';
    };

    connectBtn.onclick = () => {
      sound.uiClick();
      msg.textContent = '';
      busy(true);
      connectWallet().then(finish, (err: unknown) => {
        // A dismissed wallet prompt is "not now", not an error.
        if (!(err instanceof WalletRejectedError)) {
          msg.textContent = err instanceof Error ? err.message : 'Something sputtered. Try again.';
        }
        busy(false);
      });
    };
    spectateBtn.onclick = () => {
      sound.uiClick();
      close();
      resolve({ kind: 'spectate' });
    };

    // ── chrome: version tag + public City Ledger link + settings gear ─────
    const footer = document.createElement('div');
    footer.style.cssText =
      'position:absolute;right:14px;bottom:12px;display:flex;align-items:center;gap:10px;';
    const ledgerLink = document.createElement('a');
    ledgerLink.textContent = 'City Ledger ↗';
    ledgerLink.href = `${SERVER_URL}/ledger`;
    ledgerLink.target = '_blank';
    ledgerLink.rel = 'noopener noreferrer';
    ledgerLink.style.cssText = `color:${PALETTE.neonAmber};opacity:.8;font-size:11px;letter-spacing:1px;text-decoration:none;cursor:pointer;`;
    ledgerLink.onmouseenter = () => {
      ledgerLink.style.opacity = '1';
    };
    ledgerLink.onmouseleave = () => {
      ledgerLink.style.opacity = '.8';
    };
    const version = document.createElement('div');
    version.textContent = VERSION;
    version.style.cssText = `color:${UI_TEXT_WARM};opacity:.55;font-size:11px;letter-spacing:1px;`;
    footer.append(ledgerLink, version);

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

    hero.append(heroScrim, title, sub);
    center.append(connectBtn, spectateBtn, msg, hint);
    root.append(bg, shade, floor, hero, center, gear, gearPanel, footer);
    document.head.append(styleEl);
    document.body.append(root);
  });
}

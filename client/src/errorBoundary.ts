import { PALETTE } from '@shared/palette';

/**
 * U6c: the client error boundary. An uncaught error or rejection logs
 * itself, drops a soft in-voice veil, and reloads once — never a white
 * screen, never a raw stack in the player's face. A loop guard stops
 * reload cycling: past 2 reloads in 5 minutes it parks on the veil with
 * a manual knock instead.
 */

const GUARD_KEY = 'amperia.crashGuard';
const GUARD_WINDOW_MS = 5 * 60 * 1000;
const GUARD_MAX = 2;

let showing = false;

function recentCrashes(): number[] {
  try {
    const raw = JSON.parse(sessionStorage.getItem(GUARD_KEY) ?? '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    const cutoff = Date.now() - GUARD_WINDOW_MS;
    return raw.filter((t): t is number => typeof t === 'number' && t >= cutoff);
  } catch {
    return [];
  }
}

function veil(message: string, canAutoReload: boolean): void {
  if (showing) return;
  showing = true;
  document.getElementById('amperia-crash')?.remove();
  const root = document.createElement('div');
  root.id = 'amperia-crash';
  root.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:100',
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'justify-content:center',
    'gap:14px',
    `background:${PALETTE.ink}F2`,
    'font-family:monospace',
  ].join(';');
  const line = document.createElement('div');
  line.textContent = 'The city hiccupped.';
  line.style.cssText = `color:${PALETTE.warmGlow};font-size:22px;letter-spacing:0.14em;`;
  const sub = document.createElement('div');
  sub.textContent = message;
  sub.style.cssText = `color:${PALETTE.groundAccent};font-size:12px;max-width:460px;text-align:center;line-height:1.6;`;
  root.append(line, sub);
  if (canAutoReload) {
    const note = document.createElement('div');
    note.textContent = 're-lighting…';
    note.style.cssText = `color:${PALETTE.neonTeal};font-size:12px;letter-spacing:0.2em;`;
    root.append(note);
  } else {
    const btn = document.createElement('button');
    btn.textContent = 'Knock again';
    btn.style.cssText = [
      'margin-top:6px',
      'padding:10px 26px',
      `background:${PALETTE.neonAmber}`,
      `color:${PALETTE.ink}`,
      'border:none',
      'border-radius:8px',
      'font-family:monospace',
      'font-size:14px',
      'font-weight:bold',
      'cursor:pointer',
    ].join(';');
    btn.onclick = () => {
      sessionStorage.removeItem(GUARD_KEY);
      location.reload();
    };
    root.append(btn);
  }
  document.body.append(root);
}

function handleCrash(source: string, detail: unknown): void {
  // The log line ops can grep — full detail, console only.
  console.error(`[amperia] uncaught ${source}:`, detail);
  const crashes = recentCrashes();
  crashes.push(Date.now());
  try {
    sessionStorage.setItem(GUARD_KEY, JSON.stringify(crashes));
  } catch {
    // storage blocked — the in-memory flow still works
  }
  if (crashes.length <= GUARD_MAX) {
    veil('Something slipped a gear. Hold on — the lamps come back by themselves.', true);
    window.setTimeout(() => location.reload(), 1600);
  } else {
    veil(
      'It keeps slipping the same gear. Wait a breath, then knock — if it goes on, the Dynamo crew wants to know.',
      false,
    );
  }
}

export function installErrorBoundary(): void {
  window.addEventListener('error', (e) => {
    handleCrash('error', e.error ?? e.message);
  });
  window.addEventListener('unhandledrejection', (e) => {
    handleCrash('rejection', e.reason);
  });
}

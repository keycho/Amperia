import { DISTRICT_NAMES, type DistrictId } from '@shared/map';
import { PALETTE } from '@shared/palette';

/**
 * U5b: the tram beat — a 1.5s vignette with the district's name card while
 * the scene rebuilds underneath. DOM, so it rides across the room hop.
 */
export function playTramTransition(to: DistrictId): void {
  document.getElementById('amperia-tram')?.remove();
  const root = document.createElement('div');
  root.id = 'amperia-tram';
  root.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:30',
    'pointer-events:none',
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'justify-content:center',
    `background:radial-gradient(ellipse at center, ${PALETTE.ink}D8 30%, ${PALETTE.ink} 82%)`,
    'opacity:0',
    'transition:opacity .35s ease',
  ].join(';');

  const card = document.createElement('div');
  card.textContent = DISTRICT_NAMES[to].toUpperCase();
  card.style.cssText = [
    'font-family:monospace',
    'font-size:34px',
    'font-weight:bold',
    `color:${PALETTE.warmGlow}`,
    'letter-spacing:0.42em',
    'padding-left:0.42em', // recenters letterspaced text
    'text-shadow:0 0 22px rgba(255,178,102,0.55)',
    'opacity:0',
    'transform:translateY(6px)',
    'transition:opacity .4s ease .15s, transform .4s ease .15s',
  ].join(';');

  const sub = document.createElement('div');
  sub.textContent = 'next stop';
  sub.style.cssText = [
    'font-family:monospace',
    'font-size:11px',
    `color:${PALETTE.groundAccent}`,
    'letter-spacing:0.34em',
    'padding-left:0.34em',
    'margin-bottom:10px',
    'opacity:0',
    'transition:opacity .4s ease .1s',
  ].join(';');

  root.append(sub, card);
  document.body.append(root);

  requestAnimationFrame(() => {
    root.style.opacity = '1';
    card.style.opacity = '1';
    card.style.transform = 'translateY(0)';
    sub.style.opacity = '1';
  });
  window.setTimeout(() => {
    root.style.transition = 'opacity .45s ease';
    root.style.opacity = '0';
  }, 1150);
  window.setTimeout(() => root.remove(), 1700);
}

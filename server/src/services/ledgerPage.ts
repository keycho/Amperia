import { LEDGER_FOOTER, type PublicStatsResponse, type StatTile, type TokenTile } from '@shared/publicStats';

/**
 * The public City Ledger dashboard (P2, dressed in the brand for PP4) at
 * `/ledger`. AMPERIA-branded dark panel styling: ember motes drifting on the
 * canvas, the Dynamo glyph beside the header, chunky amber-glow numbers, tiles
 * that lift + glow on hover, an even grid (a quiet "more soon" ghost tile pads
 * the row), and the token tiles rendered as an amber-dashed "awaiting first
 * ledger" state. Mobile stacks cleanly. Live city tiles are server-rendered
 * from the shared helper and refreshed every 60s from the API (the browser
 * only writes pre-formatted strings → no drift). Comms-locked copy.
 */

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

function cityTile(t: StatTile): string {
  return `<div class="tile">
    <div class="tile-label">${esc(t.label)}</div>
    <div class="tile-value" data-live>${esc(t.value)}</div>
    <div class="tile-hint">${esc(t.hint)}</div>
  </div>`;
}

/** A quiet "more soon" ghost tile that pads the city grid to an even row. */
const GHOST_TILE = `<div class="tile tile--ghost" aria-hidden="true">
    <div class="tile-label">More soon</div>
    <div class="tile-value tile-value--ghost">◈</div>
    <div class="tile-hint">the city keeps its own books</div>
  </div>`;

function tokenTile(t: TokenTile, placeholder: string): string {
  return `<div class="tile tile--token">
    <div class="tile-label">${esc(t.label)}</div>
    <div class="tile-value tile-value--await">${esc(placeholder)}</div>
    <div class="tile-hint">${esc(t.hint)}</div>
  </div>`;
}

export function renderLedgerPage(r: PublicStatsResponse): string {
  const cityTiles = r.tiles.map(cityTile).join('') + GHOST_TILE;
  const tokenTiles = r.tokenTiles.map((t) => tokenTile(t, r.tokenPlaceholder)).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AMPERIA — the City Ledger</title>
<meta name="description" content="What the city did, in public. Aggregate, backward-looking, never estimated.">
<link rel="icon" href="data:,">
<style>
  :root{
    --void:#0A0814; --ink:#141024; --dusk:#35284F; --struct:#4E4560;
    --amber:#FFB84D; --warm:#FFD9A0; --teal:#6FD6C8; --muted:#9B8BA3; --border:#3A2F58;
  }
  *{box-sizing:border-box}
  html,body{margin:0;padding:0}
  body{
    background:
      radial-gradient(1100px 620px at 50% -8%, rgba(255,184,77,.13), transparent 60%),
      radial-gradient(900px 520px at 82% 108%, rgba(111,214,200,.07), transparent 60%),
      var(--void);
    color:var(--warm); font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;
    min-height:100vh; padding:48px 20px 64px; position:relative; overflow-x:hidden;
  }
  #motes{position:fixed; inset:0; width:100%; height:100%; pointer-events:none; z-index:0}
  .wrap{max-width:1000px; margin:0 auto; position:relative; z-index:1}
  header{text-align:center; margin-bottom:6px}
  .brand{display:flex; align-items:center; justify-content:center; gap:16px}
  /* The Dynamo glyph — concentric amber rings with a hot core. */
  .glyph{
    width:34px; height:34px; border-radius:50%; flex:0 0 auto;
    background:radial-gradient(circle at 50% 50%, var(--warm) 0 18%, var(--amber) 22% 34%, transparent 40%),
      radial-gradient(circle at 50% 50%, transparent 0 52%, var(--amber) 54% 60%, transparent 64%);
    box-shadow:0 0 20px rgba(255,184,77,.55); animation:pulse 3.4s ease-in-out infinite;
  }
  @keyframes pulse{0%,100%{opacity:.85; transform:scale(1)} 50%{opacity:1; transform:scale(1.06)}}
  .wordmark{
    font-size:clamp(34px,7vw,64px); font-weight:800; letter-spacing:.14em; margin:0;
    background:linear-gradient(180deg,var(--amber),var(--warm));
    -webkit-background-clip:text; background-clip:text; color:transparent;
    filter:drop-shadow(0 0 22px rgba(255,184,77,.35));
  }
  .subtitle{color:var(--muted); letter-spacing:.2em; font-size:12px; text-transform:uppercase; margin:8px 0 2px}
  .asof{color:var(--muted); font-size:12px; margin:0 0 34px}
  h2{
    color:var(--teal); font-size:13px; letter-spacing:.24em; text-transform:uppercase;
    margin:38px 0 14px; padding-bottom:8px; border-bottom:1px solid rgba(255,184,77,.14);
  }
  .grid{display:grid; grid-template-columns:repeat(auto-fill,minmax(min(220px,100%),1fr)); gap:14px}
  .tile{
    background:linear-gradient(180deg,rgba(53,40,79,.55),rgba(20,16,36,.92));
    border:1px solid rgba(255,184,77,.22); border-radius:12px; padding:18px 18px 16px;
    box-shadow:0 10px 30px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,217,160,.06);
    transition:transform .16s ease, box-shadow .16s ease, border-color .16s ease;
  }
  .tile:hover{
    transform:translateY(-3px);
    border-color:rgba(255,184,77,.6);
    box-shadow:0 16px 40px rgba(0,0,0,.45), 0 0 22px rgba(255,184,77,.22), inset 0 1px 0 rgba(255,217,160,.1);
  }
  .tile-label{color:var(--muted); font-size:12px; letter-spacing:.06em; margin-bottom:10px}
  .tile-value{
    font-size:34px; font-weight:800; color:var(--amber); line-height:1.02; letter-spacing:.01em;
    text-shadow:0 0 22px rgba(255,184,77,.4); word-break:break-word;
  }
  .tile-hint{color:var(--muted); font-size:11px; margin-top:10px; line-height:1.4}
  /* Ghost tile — quiet, dashed, no glow. */
  .tile--ghost{background:linear-gradient(180deg,rgba(40,34,58,.35),rgba(16,13,28,.7)); border-style:dashed; border-color:rgba(155,139,163,.3)}
  .tile--ghost:hover{transform:none; box-shadow:0 10px 30px rgba(0,0,0,.35)}
  .tile-value--ghost{font-size:26px; color:var(--struct); text-shadow:none}
  /* Token tiles — amber-dashed "awaiting" state, not plain grey. */
  .tile--token{background:linear-gradient(180deg,rgba(40,34,58,.5),rgba(16,13,28,.9)); border-color:rgba(255,184,77,.22)}
  .tile-value--await{
    font-size:15px; font-weight:700; letter-spacing:.02em; color:var(--amber); opacity:.75;
    text-shadow:none; padding:5px 9px; border:1px dashed rgba(255,184,77,.5); border-radius:8px;
    display:inline-block; margin-top:2px;
  }
  footer{margin-top:40px; text-align:center; color:var(--muted); font-size:12px; line-height:1.7}
  .footer-note{color:var(--struct); font-size:11px; margin-top:4px}
  @media (max-width:560px){
    body{padding:32px 14px 48px}
    .grid{grid-template-columns:1fr 1fr; gap:10px}
    .tile{padding:14px}
    .tile-value{font-size:26px}
    .brand{gap:10px}
  }
</style>
</head>
<body>
  <canvas id="motes"></canvas>
  <div class="wrap">
    <header>
      <div class="brand"><span class="glyph"></span><h1 class="wordmark">AMPERIA</h1></div>
      <div class="subtitle">The City Ledger</div>
      <p class="asof">as of <span id="asof">${esc(r.updatedIso)}</span></p>
    </header>

    <h2>The City</h2>
    <div class="grid" id="city">${cityTiles}</div>

    <h2>Token Ledger</h2>
    <div class="grid" id="token">${tokenTiles}</div>
    <p class="footer-note">The token layer opens later. These fill when the first City Ledger is published.</p>

    <footer>${esc(LEDGER_FOOTER)}</footer>
  </div>

  <script>
    // Ember motes drifting up the background — the landing-hero warmth.
    (function () {
      var c = document.getElementById('motes'), x = c.getContext('2d'), w, h, motes = [];
      function size(){ w = c.width = innerWidth; h = c.height = innerHeight; }
      function seed(){ motes = []; var n = Math.min(28, Math.round(w / 52));
        for (var i=0;i<n;i++) motes.push({ x:Math.random()*w, y:Math.random()*h,
          r:0.6+Math.random()*1.8, s:6+Math.random()*16, d:Math.random()*6.28, t:Math.random()*6.28 }); }
      size(); seed(); addEventListener('resize', function(){ size(); seed(); });
      var last = 0;
      function frame(ts){
        var dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts;
        x.clearRect(0,0,w,h);
        for (var i=0;i<motes.length;i++){ var m = motes[i];
          m.y -= m.s * dt; m.t += dt; m.x += Math.sin(m.d + m.t*0.6) * 6 * dt;
          if (m.y < -8){ m.y = h + 8; m.x = Math.random()*w; }
          var a = 0.20 + 0.25 * (0.5 + 0.5*Math.sin(m.t*1.7));
          x.beginPath(); x.arc(m.x, m.y, m.r, 0, 6.2832);
          x.fillStyle = 'rgba(255,190,90,' + a.toFixed(3) + ')'; x.fill();
        }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    })();

    // Live refresh: repoll every 60s, rewrite only the server-formatted strings.
    (function () {
      setInterval(function () {
        fetch('/api/public-stats', { headers: { accept: 'application/json' } })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) {
            if (!d || !d.tiles) return;
            var cells = document.querySelectorAll('#city [data-live]');
            for (var i = 0; i < cells.length && i < d.tiles.length; i++) cells[i].textContent = d.tiles[i].value;
            var asof = document.getElementById('asof');
            if (asof && d.updatedIso) asof.textContent = d.updatedIso;
          })
          .catch(function () {});
      }, 60000);
    })();
  </script>
</body>
</html>`;
}

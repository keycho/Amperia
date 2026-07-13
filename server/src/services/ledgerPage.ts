import { LEDGER_FOOTER, type PublicStatsResponse, type StatTile, type TokenTile } from '@shared/publicStats';

/**
 * The public City Ledger dashboard (P2) at `/ledger`. AMPERIA-branded dark
 * panel styling; the live city tiles are server-rendered (correct on first
 * paint) then refreshed every 60s from `/api/public-stats` — the browser only
 * ever writes strings the server already formatted (via the shared helper), so
 * nothing drifts. The TOKEN LEDGER tiles are greyed placeholders until the
 * first published ledger (the token layer is M4-gated). Comms-locked copy.
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

function tokenTile(t: TokenTile, placeholder: string): string {
  return `<div class="tile tile--token">
    <div class="tile-label">${esc(t.label)}</div>
    <div class="tile-value tile-value--muted">${esc(placeholder)}</div>
    <div class="tile-hint">${esc(t.hint)}</div>
  </div>`;
}

export function renderLedgerPage(r: PublicStatsResponse): string {
  const cityTiles = r.tiles.map(cityTile).join('');
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
    --void:#0A0814; --ink:#1E1930; --dusk:#35284F; --struct:#4E4560;
    --amber:#FFB84D; --warm:#FFD9A0; --teal:#6FD6C8; --muted:#9B8BA3;
  }
  *{box-sizing:border-box}
  html,body{margin:0;padding:0}
  body{
    background:
      radial-gradient(1100px 620px at 50% -8%, rgba(255,184,77,.12), transparent 60%),
      radial-gradient(900px 520px at 82% 108%, rgba(111,214,200,.07), transparent 60%),
      var(--void);
    color:var(--warm); font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;
    min-height:100vh; padding:48px 20px 64px;
  }
  .wrap{max-width:1000px;margin:0 auto}
  header{text-align:center;margin-bottom:8px}
  .wordmark{
    font-size:clamp(34px,7vw,64px); font-weight:800; letter-spacing:.14em; margin:0;
    background:linear-gradient(180deg,var(--amber),var(--warm));
    -webkit-background-clip:text; background-clip:text; color:transparent;
    filter:drop-shadow(0 0 22px rgba(255,184,77,.35));
  }
  .subtitle{color:var(--muted);letter-spacing:.2em;font-size:12px;text-transform:uppercase;margin:6px 0 2px}
  .asof{color:var(--muted);font-size:12px;margin:0 0 34px}
  h2{
    color:var(--teal); font-size:13px; letter-spacing:.24em; text-transform:uppercase;
    margin:38px 0 14px; padding-bottom:8px; border-bottom:1px solid rgba(255,184,77,.14);
  }
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(215px,1fr));gap:14px}
  .tile{
    background:linear-gradient(180deg,rgba(53,40,79,.55),rgba(30,25,48,.92));
    border:1px solid rgba(255,184,77,.22); border-radius:12px; padding:18px 18px 16px;
    box-shadow:0 10px 30px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,217,160,.06);
  }
  .tile--token{border-color:rgba(155,139,163,.28);background:linear-gradient(180deg,rgba(40,34,58,.5),rgba(20,17,33,.9))}
  .tile-label{color:var(--muted);font-size:12px;letter-spacing:.06em;margin-bottom:10px}
  .tile-value{
    font-size:30px;font-weight:800;color:var(--amber);line-height:1.05;
    text-shadow:0 0 18px rgba(255,184,77,.25); word-break:break-word;
  }
  .tile-value--muted{color:var(--struct);font-size:15px;font-weight:600;text-shadow:none;letter-spacing:.02em}
  .tile-hint{color:var(--muted);font-size:11px;margin-top:9px;line-height:1.4}
  footer{margin-top:40px;text-align:center;color:var(--muted);font-size:12px;line-height:1.7}
  .footer-note{color:var(--struct);font-size:11px;margin-top:4px}
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1 class="wordmark">AMPERIA</h1>
      <div class="subtitle">The City Ledger</div>
      <p class="asof">as of <span id="asof">${esc(r.updatedIso)}</span></p>
    </header>

    <h2>The City</h2>
    <div class="grid" id="city">${cityTiles}</div>

    <h2>Token Ledger</h2>
    <div class="grid" id="token">${tokenTiles}</div>
    <p class="footer-note">The token layer opens later. These fill when the first City Ledger is published.</p>

    <footer>
      ${esc(LEDGER_FOOTER)}
    </footer>
  </div>

  <script>
    // Live refresh: repoll every 60s and rewrite ONLY the pre-formatted
    // strings the server sent (no client-side number formatting → no drift).
    (function () {
      var refresh = function () {
        fetch('/api/public-stats', { headers: { accept: 'application/json' } })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) {
            if (!d || !d.tiles) return;
            var cells = document.querySelectorAll('#city [data-live]');
            for (var i = 0; i < cells.length && i < d.tiles.length; i++) {
              cells[i].textContent = d.tiles[i].value;
            }
            var asof = document.getElementById('asof');
            if (asof && d.updatedIso) asof.textContent = d.updatedIso;
          })
          .catch(function () { /* keep the last good numbers */ });
      };
      setInterval(refresh, 60000);
    })();
  </script>
</body>
</html>`;
}

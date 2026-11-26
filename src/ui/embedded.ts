/** Minimal embedded dashboard used when web/dist has not been built yet. */

export const EMBEDDED_DASHBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>GitWhisper Dashboard</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; background: #08090c; color: #e7e9ee; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: radial-gradient(circle at 12% -10%, #17203a 0, #08090c 42%); }
    main { max-width: 980px; margin: 0 auto; padding: 56px 24px; }
    .brand { color: #67e8f9; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; font-size: 12px; }
    h1 { font-size: clamp(30px, 5vw, 50px); margin: 12px 0 8px; letter-spacing: -.04em; }
    .muted { color: #8a91a3; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 14px; margin-top: 36px; }
    .card { background: #101219; border: 1px solid #222634; border-radius: 16px; padding: 20px; }
    .card strong { display: block; font-size: 28px; margin-top: 8px; }
    .bar { height: 7px; border-radius: 99px; background: #1b2030; overflow: hidden; margin-top: 16px; }
    .bar > i { display: block; height: 100%; background: linear-gradient(90deg, #22d3ee, #818cf8); }
    pre { white-space: pre-wrap; word-break: break-word; font-size: 12px; color: #a5b4fc; }
    .warn { color: #fbbf24; }
    footer { margin-top: 32px; font-size: 12px; }
  </style>
</head>
<body>
  <main>
    <div class="brand">GitWhisper · local dashboard</div>
    <h1>Your repository, decoded.</h1>
    <p class="muted" id="subtitle">Loading live repository signals…</p>
    <section class="grid" id="cards"></section>
    <section class="card" style="margin-top:14px">
      <div class="muted">Review notes</div>
      <div id="notes" class="warn" style="margin-top:10px"></div>
    </section>
    <footer class="muted">Embedded fallback UI. Run <code>npm run build</code> for the full React + Tailwind dashboard.</footer>
  </main>
  <script>
    function card(label, value, hint) {
      return '<div class="card"><div class="muted">' + label + '</div><strong>' + value + '</strong><div class="muted">' + hint + '</div></div>';
    }
    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
    }
    Promise.all([
      fetch('/api/summary').then(function (r) { return r.json(); }),
      fetch('/api/review').then(function (r) { return r.json(); }),
      fetch('/api/config').then(function (r) { return r.json(); })
    ]).then(function (results) {
      var summary = results[0];
      var review = results[1];
      var config = results[2];
      document.getElementById('subtitle').textContent = summary.repository + ' · ' + summary.branch + ' · engine ' + config.provider;
      document.getElementById('cards').innerHTML =
        card('Health score', summary.healthScore + '/100', 'security-aware score') +
        card('Review score', review.score + '/100', escapeHtml(review.summary)) +
        card('Secret findings', summary.secretFindings, summary.secretFindings ? 'rotate before pushing' : 'no leaked keys detected') +
        card('Recent commits', summary.commits.length, 'last ' + summary.commits.length + ' commits');
      document.getElementById('notes').innerHTML = review.suggestions.map(function (item) { return '• ' + escapeHtml(item); }).join('<br>');
    }).catch(function (error) {
      document.getElementById('subtitle').textContent = 'Could not load local data: ' + error.message;
    });
  </script>
</body>
</html>
`;

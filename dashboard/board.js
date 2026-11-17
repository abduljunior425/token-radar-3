// Token Radar radar-4 dashboard renderer. Reads window.__RADAR__ (written by
// main.ts from the same board), renders the board, and never fetches anything.
(function () {
  var D = window.__RADAR__;
  var root = document.getElementById('radar');
  if (!D || !root) return;
  root.setAttribute('aria-busy', 'false');

  var state = { q: '', cat: '', chain: '', watch: false, sort: 'rank', dir: 1 };
  var fmtUsd = function (n) { return '$' + Math.round(n).toLocaleString('en-US'); };
  var fmtTvl = function (n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    return fmtUsd(n);
  };
  var esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var pct = function (v) {
    if (v === null || v === undefined) return 'n/a';
    var cls = v >= 0 ? 'up' : 'down';
    return '<span class="' + cls + '">' + (v >= 0 ? '+' : '') + v.toFixed(1) + '%</span>';
  };

  var cats = [];
  var chains = [];
  D.rows.forEach(function (r) {
    if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category);
    (r.chains || []).forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
  });
  cats.sort(); chains.sort();

  function filtered() {
    var rows = D.rows.filter(function (r) {
      if (state.watch && !r.on_watchlist) return false;
      if (state.cat && r.category !== state.cat) return false;
      if (state.chain && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.q) {
        var hay = (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase();
        if (hay.indexOf(state.q.toLowerCase()) < 0) return false;
      }
      return true;
    });
    var key = state.sort;
    rows.sort(function (a, b) {
      var d = 0;
      if (key === 'rank') d = a.rank - b.rank;
      else if (key === 'value') d = b.implied_value_usd - a.implied_value_usd;
      else if (key === 'tvl') d = b.tvl_usd - a.tvl_usd;
      else if (key === 'week') d = (b.change_7d || 0) - (a.change_7d || 0);
      else if (key === 'age') d = b.age_days - a.age_days;
      else if (key === 'name') d = a.name.localeCompare(b.name);
      return state.dir * d;
    });
    return rows;
  }

  function rowHtml(r) {
    return '<tr data-slug="' + esc(r.slug) + '"><td class="num">' + r.rank + '</td>' +
      '<td><span class="nm">' + esc(r.name) + '</span>' +
      (r.on_watchlist ? '<span class="tag">watchlist</span>' : '') +
      '<br><span style="color:var(--dim);font-size:13px">' + esc(r.slug) + ' · ' + esc(r.category || 'uncategorised') + '</span></td>' +
      '<td class="num"><b>' + fmtUsd(r.implied_value_usd) + '</b></td>' +
      '<td class="num">' + fmtTvl(r.tvl_usd) + '</td>' +
      '<td class="num">' + pct(r.change_7d) + '</td>' +
      '<td class="num">' + r.age_days + 'd</td>' +
      '<td>' + esc((r.chains || []).slice(0, 3).join(', ')) + '</td></tr>';
  }

  function render() {
    var rows = filtered();
    var top = D.rows.slice(0, 3);
    var leaders = top.map(function (r, i) {
      return '<button class="leader" data-slug="' + esc(r.slug) + '"><span class="medal">#' + (i + 1) + ' · ' +
        (r.on_watchlist ? 'watchlist' : 'early') + '</span><b>' + esc(r.name) + '</b>' +
        '<span class="val">' + fmtUsd(r.implied_value_usd) + '</span>' +
        '<br><span class="sub">' + fmtTvl(r.tvl_usd) + ' TVL · ' + r.age_days + ' days listed</span></button>';
    }).join('');
    var opts = function (list, cur) {
      return '<option value="">All</option>' + list.map(function (v) {
        return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(v) + '</option>';
      }).join('');
    };
    root.innerHTML =
      '<div class="wrap"><header class="hero"><h1>Token Radar <b>radar-4</b></h1>' +
      '<p>Pre-token protocols, ranked by what their launch would be worth if their record stayed as it is. ' +
      'The board covers the whole watchlist — every protocol with at least $50M of TVL that records no token — ' +
      'plus every other launch candidate below the floor. It is the radar&rsquo;s own claim, not a price and not a prediction that a token will launch.</p>' +
      '<p class="model">' + esc(D.formula) + '</p></header>' +
      '<div class="stats">' +
      '<div class="stat"><b>' + D.rows.length + '</b><span>ranked rows</span></div>' +
      '<div class="stat"><b>' + D.watchlist_size + '</b><span>watchlist covered</span></div>' +
      '<div class="stat"><b>' + D.early_size + '</b><span>early, below the floor</span></div>' +
      '<div class="stat"><b>' + D.set_aside + '</b><span>wrapped / staked set aside</span></div>' +
      '<div class="stat"><b>' + esc(D.as_of) + '</b><span>snapshot date</span></div></div>' +
      '<div class="leaders">' + leaders + '</div>' +
      '<div class="controls"><input id="q" type="search" placeholder="Search name or slug…" value="' + esc(state.q) + '" aria-label="Search protocols">' +
      '<select id="cat" aria-label="Category">' + opts(cats, state.cat) + '</select>' +
      '<select id="chain" aria-label="Chain">' + opts(chains, state.chain) + '</select>' +
      '<label class="chk"><input id="watch" type="checkbox"' + (state.watch ? ' checked' : '') + '> Watchlist only</label></div>' +
      '<p class="count">Showing ' + rows.length + ' of ' + D.rows.length + ' ranked protocols. Click a row for its detail and farm plan.</p>' +
      '<table class="board"><thead><tr>' +
      '<th class="num"><button data-sort="rank">Rank</button></th><th><button data-sort="name">Protocol</button></th>' +
      '<th class="num"><button data-sort="value">Implied value</button></th>' +
      '<th class="num"><button data-sort="tvl">TVL</button></th>' +
      '<th class="num"><button data-sort="week">7d</button></th>' +
      '<th class="num"><button data-sort="age">Age</button></th><th>Chains</th></tr></thead>' +
      '<tbody>' + rows.map(rowHtml).join('') + '</tbody></table>' +
      '<section class="live"><h2>Already live — tokens that trade</h2>' +
      '<p style="color:var(--dim)">These protocols already record a token, so they are not launch candidates. Their market caps are the market&rsquo;s own numbers, shown for contrast with the board&rsquo;s implied values.</p>' +
      '<ul>' + D.live.map(function (l) {
        return '<li><b>' + esc(l.name) + '</b> (' + esc(l.symbol || '?') + ') — ' + (l.mcap_usd ? fmtUsd(l.mcap_usd) : 'no market cap') + '</li>';
      }).join('') + '</ul></section>' +
      '<footer>Model: ' + esc(D.formula) + '. Size is concave (TVL to the 0.7), the week is capped linear, ' +
      'maturity is logarithmic over three years, chain spread is a square root, wild weeks pay a calm haircut, ' +
      'and the seasoned middle (180–730 days) earns a bonus. “Records no token” means the snapshot carries no ' +
      'market cap, CoinGecko id or symbol — the record, not proof it has none. Snapshot ' + esc(D.as_of) + '.</footer></div>' +
      '<div id="drawer"></div>';

    document.getElementById('q').addEventListener('input', function (e) { state.q = e.target.value; render(); var q = document.getElementById('q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); });
    document.getElementById('cat').addEventListener('change', function (e) { state.cat = e.target.value; render(); });
    document.getElementById('chain').addEventListener('change', function (e) { state.chain = e.target.value; render(); });
    document.getElementById('watch').addEventListener('change', function (e) { state.watch = e.target.checked; render(); });
    root.querySelectorAll('th button').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-sort');
        if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = 1; }
        render();
      });
    });
    root.querySelectorAll('[data-slug]').forEach(function (el) {
      el.addEventListener('click', function () { openDetail(el.getAttribute('data-slug')); });
    });
  }

  function openDetail(slug) {
    var r = null;
    D.rows.forEach(function (x) { if (x.slug === slug) r = x; });
    if (!r) return;
    var f = r.factors;
    var box = document.getElementById('drawer');
    box.innerHTML = '<aside class="drawer" role="dialog" aria-label="' + esc(r.name) + ' detail">' +
      '<button class="close" id="close">Close ✕</button>' +
      '<h2>' + esc(r.name) + '</h2><p style="color:var(--dim)">Rank #' + r.rank + ' · ' + esc(r.slug) + ' · ' + esc(r.category || 'uncategorised') + '</p>' +
      '<dl><dt>Implied value</dt><dd>' + fmtUsd(r.implied_value_usd) + '</dd>' +
      '<dt>TVL</dt><dd>' + fmtTvl(r.tvl_usd) + '</dd>' +
      '<dt>7-day change</dt><dd>' + pct(r.change_7d) + '</dd>' +
      '<dt>Age listed</dt><dd>' + r.age_days + ' days</dd>' +
      '<dt>Chains</dt><dd>' + esc(r.chains.join(', ')) + '</dd>' +
      '<dt>Watchlist</dt><dd>' + (r.on_watchlist ? 'Yes — $50M+ and no token on record' : 'No — early, below the floor') + '</dd></dl>' +
      '<h3>Why this value — radar-4 factors</h3><dl>' +
      '<dt>Size (TVL^0.7)</dt><dd>' + f.size.toFixed(2) + '</dd>' +
      '<dt>Growth (capped week)</dt><dd>' + f.growth.toFixed(3) + '</dd>' +
      '<dt>Tenure (log age)</dt><dd>' + f.tenure.toFixed(3) + '</dd>' +
      '<dt>Breadth (√chains)</dt><dd>' + f.breadth.toFixed(3) + '</dd>' +
      '<dt>Calm (stability)</dt><dd>' + f.calm.toFixed(3) + '</dd>' +
      '<dt>Seasoning</dt><dd>' + f.seasoning.toFixed(2) + '</dd></dl>' +
      '<h3>How to farm it — six steps</h3><ol>' +
      r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<p class="note">Implied value is this radar&rsquo;s own claim from the snapshot&rsquo;s figures. It is not a price, ' +
      'not a prediction that a token will launch, and not a promise of an airdrop. Farming costs gas and carries smart-contract risk; never deposit more than you can afford to lose.</p></aside>';
    document.getElementById('close').addEventListener('click', function () { box.innerHTML = ''; });
  }

  render();
})();

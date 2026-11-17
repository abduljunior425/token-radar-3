// Token Radar, radar-4: a program/v1 entry for token-radar-01, Node 22, standard library only.
//
// The radar-4 model scores every launch candidate from the sealed snapshot's own
// figures and nothing else: no protocol name is special-cased, and the same
// function scores every row. The board ranks protocols that record no token by
// an implied value, sets wrapped / staked / bridged / exchange products aside
// rather than ranking them as first tokens, and keeps protocols whose token
// already trades in a separate live list so the reader can tell the two apart.
//
// Model (radar-4), in words first, numbers second:
//   implied = 1,000,000 x (TVL in millions)^0.7 x growth x tenure x breadth x calm x seasoning
//   growth    = 1 + clamp(change_7d, -60, +150) / 200   -- a capped linear week: a hot week
//               lifts value, a cold week cuts it, but no single week can move it by more
//               than +75% or -30%.
//   tenure    = 0.60 + 0.40 x min(ln(1 + age_days) / ln(1 + 1095), 1)  -- maturity grows
//               with the *log* of age over three years, so the first year of survival
//               matters far more than the third.
//   breadth   = min(1 + 0.08 x sqrt(chains - 1), 1.40)  -- chain spread with a square
//               root: the second chain matters, the twentieth barely does.
//   calm      = 1 - 0.15 x min(|change_7d| / 100, 1)    -- a stability haircut: wild
//               swings in either direction trim the value, because a launch priced off
//               a spike is priced off noise.
//   seasoning = 0.85 when age_days < 90 (too young to have held TVL through a cycle),
//               1.10 when 180 <= age_days <= 730 (the seasoned middle: old enough to
//               trust, young enough to still be early), 1.00 otherwise.
//   age_days is the days from listed_at to the snapshot's as_of date; when the
//   snapshot carries no listing date the model counts 180 days.
//
// Why this shape, and how it differs from a plain TVL table: size enters concave
// (power 0.7), so a mid-size protocol with a strong, calm week and two years of
// seasoning can outrank a flat giant; growth is linear and capped rather than
// saturating, so the reader can see exactly what a week's move did; maturity is
// logarithmic rather than a root or a line; and calm is a factor no earlier
// radar used -- it is the model's bet that steady TVL is worth more per dollar
// than spiky TVL when a token has not launched yet.

export interface Proto {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snap {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Proto[];
  watchlist: string[];
}

export interface Factors {
  size: number;
  growth: number;
  tenure: number;
  breadth: number;
  calm: number;
  seasoning: number;
  age_days: number;
}

export interface Row {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number;
  on_watchlist: boolean;
  pre_token: boolean;
  factors: Factors;
}

export interface RadarData {
  as_of: string;
  floor_usd: number;
  model: string;
  formula: string;
  rows: Row[];
  live: { slug: string; name: string; mcap_usd: number | null; symbol: string | null; tvl_usd: number }[];
  watchlist_size: number;
  early_size: number;
  live_size: number;
  set_aside: number;
}

/** Days from `listed` (YYYY-MM-DD) to `asOf` (YYYY-MM-DD); 180 when unknown. */
export function ageDays(listed: string | null, asOf: string): number {
  if (listed === null) return 180;
  const ms = Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${listed}T00:00:00Z`);
  if (!Number.isFinite(ms) || ms < 0) return 180;
  return Math.floor(ms / 86_400_000);
}

/** Clamp `v` into [lo, hi]. */
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** The radar-4 factor breakdown for one protocol. Pure function of the snapshot. */
export function factorBreakdown(p: Proto, asOf: string): Factors {
  const age = ageDays(p.listed_at, asOf);
  const week = p.change_7d ?? 0;
  const size = Math.pow(Math.max(p.tvl_usd, 1) / 1_000_000, 0.7);
  const growth = 1 + clamp(week, -60, 150) / 200;
  const tenure = 0.6 + 0.4 * Math.min(Math.log1p(age) / Math.log1p(1095), 1);
  const breadth = Math.min(1 + 0.08 * Math.sqrt(Math.max(p.chains.length - 1, 0)), 1.4);
  const calm = 1 - 0.15 * Math.min(Math.abs(week) / 100, 1);
  const seasoning = age < 90 ? 0.85 : age >= 180 && age <= 730 ? 1.1 : 1.0;
  return { size, growth, tenure, breadth, calm, seasoning, age_days: age };
}

/** radar-4 implied value in whole dollars: 1,000,000 x size x growth x tenure x breadth x calm x seasoning. */
export function impliedValue(p: Proto, asOf: string): number {
  const f = factorBreakdown(p, asOf);
  const value = 1_000_000 * f.size * f.growth * f.tenure * f.breadth * f.calm * f.seasoning;
  return Math.max(1, Math.round(value));
}

/** True when the snapshot records no token for the protocol. */
export function recordsNoToken(p: Proto): boolean {
  return p.gecko_id === null && p.symbol === null;
}

/** Products that are not a first-token launch, however large their TVL. */
const SET_ASIDE_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const VERSION_TAIL = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_LEAD = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** True when the protocol is a launch candidate: no token on record and not a set-aside product. */
export function isCandidate(p: Proto): boolean {
  if (!recordsNoToken(p)) return false;
  if (p.category !== null && SET_ASIDE_CATEGORIES.has(p.category)) return false;
  if (VERSION_TAIL.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_LEAD.test(p.name)) return false;
  return true;
}

/** The core on-chain action for a category, used to make each farm plan concrete. */
function coreAction(category: string | null): string {
  switch (category) {
    case 'Dexs':
      return 'swap a small trade and add liquidity to the deepest pool';
    case 'Lending':
      return 'supply collateral, then borrow a small amount against it';
    case 'Yield':
    case 'Yield Aggregator':
      return 'deposit into the highest-TVL vault and let the yield compound';
    case 'Derivatives':
    case 'Options':
    case 'Perps':
      return 'open a small hedged position and close it after a day';
    case 'Restaking':
      return 'restake the position and keep the receipt token in your wallet';
    case 'CDP':
      return 'mint a small amount of the stable asset against collateral';
    case 'Liquid Staking':
      return 'stake the base asset and hold the liquid receipt token';
    default:
      return 'use the protocol once end to end, depositing and withdrawing';
  }
}

/** A six-step farm plan, concrete per protocol: what to do, what it costs, how long it takes. */
export function farmSteps(p: Proto, asOf: string): string[] {
  const f = factorBreakdown(p, asOf);
  const chain = p.chains[0] ?? 'its main chain';
  const second = p.chains.length > 1 ? ` and repeat the deposit once on ${p.chains[1]}` : '';
  const ticket = p.tvl_usd >= 500_000_000 ? 200 : p.tvl_usd >= 100_000_000 ? 100 : 50;
  const weeks = p.change_7d !== null && p.change_7d > 5 ? 12 : p.change_7d !== null && p.change_7d < -5 ? 6 : 8;
  const stay = f.seasoning > 1 ? 'seasoned' : f.age_days < 90 ? 'very young' : 'established';
  const action = coreAction(p.category);
  return [
    `Read ${p.name} on its official site and docs for 20 minutes and confirm it records no token, its ${p.category ?? 'uncategorised'} contracts live on ${chain}, and the wallet you will use is the one you control.`,
    `Bridge about $${ticket} to ${chain} (about $1-3 in bridge and gas fees, 10-30 minutes) and keep a further $5 of the chain gas token aside so you are never stuck mid-transaction.`,
    `On ${chain}, ${action} with about $${ticket} (gas roughly $0.50-2 per transaction, 15 minutes), then withdraw a small part at once to prove the exit path works before you commit the rest.`,
    `Leave the $${ticket} position working for ${weeks} weeks and touch it at least once a week -- a second deposit, a claim, or a rebalance${second} -- because most snapshots reward repeated use over a single deposit.`,
    `Keep a dated log of every transaction hash, deposit and withdrawal for ${p.name} (5 minutes a week); a ${stay} protocol with ${f.age_days} days of history is judged on sustained activity, not on one afternoon.`,
    `After ${weeks} weeks, withdraw half, leave half running, and check the protocol's announcements weekly for 30 days: if a token or points program appears, your log is the proof of the activity you did.`,
  ];
}

/** Parse and lightly validate the sealed snapshot. */
export function parseSnapshot(text: string): Snap {
  const raw = JSON.parse(text) as Snap;
  if (!Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) {
    throw new Error('snapshot: protocols and watchlist must be arrays');
  }
  return raw;
}

/** Build the ranked board plus the dashboard data. Watchlist first by value, never by name. */
export function buildRadar(snap: Snap): { board: Row[]; data: RadarData } {
  const scored: Row[] = [];
  let setAside = 0;
  for (const p of snap.protocols) {
    if (!isCandidate(p)) {
      if (recordsNoToken(p)) setAside += 1;
      continue;
    }
    scored.push({
      slug: p.slug,
      name: p.name,
      rank: 0,
      implied_value_usd: impliedValue(p, snap.as_of),
      farm_steps: farmSteps(p, snap.as_of),
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      age_days: ageDays(p.listed_at, snap.as_of),
      on_watchlist: snap.watchlist.includes(p.slug),
      pre_token: true,
      factors: factorBreakdown(p, snap.as_of),
    });
  }
  // Rank by implied value, ties broken by TVL then slug so the order is total and stable.
  scored.sort((a, b) => b.implied_value_usd - a.implied_value_usd || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1));
  scored.forEach((row, i) => {
    row.rank = i + 1;
  });
  const live = snap.protocols
    .filter((p) => !recordsNoToken(p) && p.mcap_usd !== null)
    .map((p) => ({ slug: p.slug, name: p.name, mcap_usd: p.mcap_usd, symbol: p.symbol, tvl_usd: p.tvl_usd }))
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0))
    .slice(0, 60);
  const data: RadarData = {
    as_of: snap.as_of,
    floor_usd: snap.floor_usd,
    model: 'radar-4',
    formula: 'implied = 1,000,000 x (TVL/1M)^0.7 x growth x tenure x breadth x calm x seasoning',
    rows: scored,
    live,
    watchlist_size: snap.watchlist.length,
    early_size: scored.filter((r) => !r.on_watchlist).length,
    live_size: live.length,
    set_aside: setAside,
  };
  return { board: scored, data };
}

/** The first gate problem with the board, or null when it is gate-shaped. */
export function boardProblem(board: Row[], snap: Snap): string | null {
  if (board.length < 100 || board.length > 4000) return `board holds ${board.length} rows, the gate wants 100 to 4000`;
  const seen = new Set<string>();
  for (const row of board) {
    if (seen.has(row.slug)) return `slug ${row.slug} appears twice`;
    seen.add(row.slug);
    if (!snap.protocols.some((p) => p.slug === row.slug)) return `slug ${row.slug} is not in the snapshot`;
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) return `row ${row.slug} has ${row.farm_steps.length} farm steps`;
    for (const s of row.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `row ${row.slug} has a farm step of ${t.length} characters`;
    }
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd < 1) return `row ${row.slug} has a bad implied value`;
  }
  for (let i = 0; i < board.length; i += 1) {
    if (board[i]!.rank !== i + 1) return `rank ${board[i]!.rank} sits at position ${i + 1}`;
    if (i > 0 && board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${board[i]!.slug} rises above the row before it`;
  }
  for (const slug of snap.watchlist) {
    if (!seen.has(slug)) return `watchlist slug ${slug} is missing from the board`;
  }
  if (new Set(board.map((r) => r.implied_value_usd)).size < 2) return 'every implied value is the same';
  return null;
}

/** The dashboard's data file: a plain script that sets window.__RADAR__. No network, no imports. */
export function dataScript(data: RadarData): string {
  return `window.__RADAR__ = ${JSON.stringify(data)};\n`;
}

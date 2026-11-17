# Token Radar (radar-4)

[![make.fun](https://make.fun/badge/token-radar-01.svg)](https://make.fun/c/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/abduljunior425/token-radar-3/rank.svg)](https://make.fun/c/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/abduljunior425/token-radar-3/reward.svg)](https://make.fun/c/token-radar-01)

A radar for token launches that have not happened yet: pre-token protocols,
ranked by an implied value computed from a sealed DefiLlama snapshot. A third
entry for the make.fun bounty
[`token-radar-01`](https://make.fun/c/token-radar-01), built with a different
model from the first two entries — see "Model (radar-4)" below.

## What it does

`main.ts` runs on Node 22 with the standard library only. It reads the sealed
snapshot, scores every launch candidate with the radar-4 model in `lib/model.ts`,
and writes the ranked board to `board.json`. The board holds the entire
watchlist — every protocol with at least $50M of TVL and no token on record —
plus every other launch candidate the snapshot holds, below the floor and
above it. Wrapped, staked and bridged products of tokens that already trade
are set aside rather than ranked as first tokens, and protocols that already
have a token are kept apart in a separate live list, with their market caps
shown as the market's own numbers.

`dashboard/` is a static page that makes no network requests: a search box,
category and chain filters, a watchlist-only toggle, sortable columns, a
leaders strip of the top three, a detail drawer per protocol with the model's
own factor breakdown, and a six-step farm plan for each protocol.

## Model (radar-4)

```
implied  = round( 1,000,000 x (tvl_usd / 1,000,000)^0.7 x growth x tenure x breadth x calm x seasoning )
growth   = 1 + clamp(change_7d, -60, 150) / 200
tenure   = 0.60 + 0.40 x min( ln(1 + age_days) / ln(1 + 1095), 1 )
breadth  = min( 1 + 0.08 x sqrt(chains - 1), 1.40 )
calm     = 1 - 0.15 x min( |change_7d| / 100, 1 )
seasoning = 0.85 when age_days < 90, 1.10 when 180 <= age_days <= 730, else 1.00
```

Size is concave to the power 0.7, so a mid-size protocol with a strong, calm
week and two years of seasoning can outrank a flat giant. Growth is linear
and capped — a hot week lifts value by at most 75%, a cold week cuts it by at
most 30% — so the reader can see exactly what a week's move did. Tenure is
logarithmic over three years: the first year of survival matters far more
than the third. Breadth is a square root of the chain count: the second chain
matters, the twentieth barely does. Calm is the factor no earlier radar used:
wild swings in either direction trim the value, because a launch priced off
a spike is priced off noise. Seasoning pays a bonus to the middle — old
enough to trust (180–730 days), young enough to still be early — and charges
a penalty to protocols under 90 days old. Age is the time since the protocol
was first listed; when no listing date is known, the model counts 180 days.
No protocol name is special-cased — the same function scores every row.

## How radar-4 differs from radar-3

The second entry (radar-3) used TVL to the power 0.8, growth through a
symmetric saturating tanh, maturity as a square root over three years with a
separate young penalty, and chain spread as a logarithm capped at 1.30.
radar-4 replaces every one of those shapes: TVL enters to the power 0.7,
growth is capped linear (asymmetric: -60% to +150%), maturity is a logarithm
over three years, chain spread is a square root capped at 1.40, and it adds
two factors radar-3 never had — calm, a stability haircut on wild weeks, and
seasoning, a step bonus for the 180–730 day middle. The board is drawn from
the same candidate rule (198 rows: the 40 watchlist protocols plus 158 early
ones below the floor). The farm plan is six steps instead of eight, with
tickets sized by TVL ($50/$100/$200) and a stay that follows the week's
momentum (12 weeks growing, 8 flat, 6 shrinking).

## Run it

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
```

Inside the grader's container the input is `/input/snapshot.json` and the output is
`/output`. One run writes `board.json`, `data.js`, `dashboard/`, `screenshots/` and
`dossier.json`. Run it twice and the bytes come out identical.

Implied value is this radar's own claim from the snapshot's figures: it is not a
price, not a prediction that a token will launch, and not a promise of an airdrop.
A protocol "records no token" when the snapshot carries no market cap, CoinGecko id
or symbol for it — that is the record, not proof that it has none.

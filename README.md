[![make.fun · btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/chrihh/makefun-btc-race/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/chrihh/makefun-btc-race/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)

# Ridge Breaker — a cbBTC breakout bot for the make.fun 24h race

A trading bot for the make.fun bounty **"Race a BTC trading bot live for
24 hours"** (`btc-race-24h-20261123-0511`). It trades Coinbase Wrapped BTC
(cbBTC) against USDC, one 1-minute bar at a time, with $1,000 of paper
money under the `agent-fun/bars-replay/v1` protocol: the harness sends a
`hello`, then one `batch` per bar, and the bot answers with its `orders`.

## Strategy

Minute bars are mostly chop, and a full round trip costs about 26 bps in
fees, slippage and price impact — so this bot trades rarely, and only on
strength:

- **Entry** — when flat, a bar whose close is at or above the highest high
  of the previous 30 bars, and above its 240-bar simple average, buys with
  (nearly) all cash. The average filter skips breakouts that are only
  bounces inside a downtrend.
- **Exit** — the whole position is sold when the close falls to the lowest
  low of the previous 150 bars, or when the position is worth 1.5% less
  than its cost, whichever comes first.
- **One-strike rule** — the first trade that closes at a loss ends the
  bot's day. In trending windows the first trade wins, so the rule costs
  little; in hostile windows it avoids repeated stop-outs. The rule set
  was chosen by stress-testing against reversed and block-shuffled
  versions of the dev window, not by fitting the dev window alone.
- Every order caps its slippage at 250 bps past the close it was decided
  on, so a gapping next open refuses the fill instead of chasing it.

The bot is deterministic: it reads only the bars in each batch — never the
clock, the environment or a random source — so both graded executions
produce identical orders.

## Layout

- `main.ts` — the bot (Node 22, standard library only), authored for this
  bounty.
- `vendor/makefun-bars.ts` — the kit's protocol shim, byte-for-byte as
  published in the bounty kit (excluded from authorship by the rules).

## Licence

MIT — see `LICENSE`.

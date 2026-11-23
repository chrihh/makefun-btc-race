// Breakout bot for the cbBTC 24-hour race (agent-fun/bars-replay/v1).
//
// Idea, in the protocol's own terms: the harness sends a hello, then one
// batch per bar, and the bot answers each batch with its orders. Minute
// bars of cbBTC are mostly chop: a full round trip costs about 26 bps in
// fees, slippage and impact, so trading every wiggle bleeds money. This
// bot trades rarely and only on strength:
//
//   - Entry: when flat and the latest bar's close is at or above the
//     highest high of the previous ENTRY_BARS bars, buy with (nearly)
//     all cash. A close that breaks a half-hour range is a real move,
//     not a wiggle. The close must also sit above its TREND_BARS-bar
//     simple average: breakouts under a falling long average are
//     usually just bounces in a downtrend, and they are skipped.
//   - Exit, the whole position, on whichever comes first:
//       * the close falls to the lowest low of the previous EXIT_BARS
//         bars (the move that justified the trade is over), or
//       * the position is worth STOP_BPS less than its cost (the
//         breakout failed; cut it before it grows).
//   - One-strike rule: the first trade that closes at a loss ends the
//     bot's day. Back-tests on shuffled and reversed windows show a
//     first loss marks a hostile window: sitting out after it costs
//     little in trending windows (where the first trade wins) and
//     avoids the repeated stop-outs that bleed a falling window.
//   - Every order caps its slippage at MAX_SLIPPAGE_BPS past the close
//     it was decided on, so a gap at the next open refuses the fill and
//     the rule is simply read again on the next bar.
//
// Everything is deterministic: only the bars in the batches are read,
// never the clock, the environment or a random source, so the two
// graded executions produce identical orders.

import { BPS, runBars, type Bar, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

/** A close breaking the high of this many previous bars is an entry. */
const ENTRY_BARS = 30;
/** A close at the low of this many previous bars ends the trade. */
const EXIT_BARS = 150;
/** Entries also need the close above the average of this many bars. */
const TREND_BARS = 240;
/** After this many losing trades the bot sits out the rest of the window. */
const MAX_LOSSES = 1;
/** Cut a position worth this fraction under its cost: 150 bps = 1.5%. */
const STOP_NUM = 985n;
const STOP_DEN = 1000n;
/** Widest move from the deciding close a fill may take: 2.5%. */
const MAX_SLIPPAGE_BPS = 250;
/** Spend this share of cash on an entry, keeping a small residue. */
const SPEND_NUM = 999n;
const SPEND_DEN = 1000n;

const SYMBOL = 'CBBTC';

/** The bars seen so far, oldest first; only what the exits and entry read. */
const highs: number[] = [];
const lows: number[] = [];
const closes: number[] = [];

function push(bar: Bar): void {
  highs.push(Number(bar.h));
  lows.push(Number(bar.l));
  closes.push(Number(bar.c));
}

/** Highest high of the `n` bars before the latest one. */
function priorHigh(n: number): number {
  let m = -Infinity;
  for (let i = highs.length - 1 - n; i < highs.length - 1; i++) if (highs[i]! > m) m = highs[i]!;
  return m;
}

/** Lowest low of the last `n` bars, the latest one included. */
function recentLow(n: number): number {
  let m = Infinity;
  for (let i = lows.length - n; i < lows.length; i++) if (lows[i]! < m) m = lows[i]!;
  return m;
}

/** Simple average of the last `n` closes, the latest one included. */
function sma(n: number): number {
  let s = 0;
  for (let i = closes.length - n; i < closes.length; i++) s += closes[i]!;
  return s / n;
}

/** Trades closed at a loss so far (judged when the sell is decided). */
let losses = 0;

await runBars({
  onBatch(state, batch) {
    let fresh = false;
    for (const bar of batch.bars) {
      if (bar.symbol !== SYMBOL) continue;
      push(bar);
      fresh = true;
    }
    if (!fresh || state.warmingUp) return [];

    const held = state.positions.get(SYMBOL);
    const close = closes[closes.length - 1]!;

    if (held !== undefined) {
      const value = state.value(SYMBOL, held.qty);
      // Exit 1: the position is worth 1.5% less than it cost.
      if (value * STOP_DEN <= held.cost * STOP_NUM) {
        losses++;
        const sell: SellInput = { side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS };
        return [sell];
      }
      // Exit 2: the close fell to the lowest low of the exit window.
      if (closes.length > EXIT_BARS && close <= recentLow(EXIT_BARS)) {
        if (value < held.cost) losses++;
        const sell: SellInput = { side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS };
        return [sell];
      }
      return [];
    }

    // One-strike rule: after a losing trade, sit out the rest of the window.
    if (losses >= MAX_LOSSES) return [];

    // Entry: a close at or above the prior half-hour's highest high,
    // with the close also above its long average (a real uptrend).
    if (closes.length > ENTRY_BARS && close >= priorHigh(ENTRY_BARS) && (closes.length <= TREND_BARS || close > sma(TREND_BARS))) {
      const byWeight = (BigInt(state.hello.caps.max_weight_bps) * state.equity) / BPS;
      let spend = (state.cash * SPEND_NUM) / SPEND_DEN;
      if (byWeight < spend) spend = byWeight;
      if (spend === 0n || spend < BigInt(state.hello.fees.min_notional_quote_units)) return [];
      const buy: BuyInput = { side: 'buy', symbol: SYMBOL, notional_quote_units: spend, max_slippage_bps: MAX_SLIPPAGE_BPS };
      return [buy];
    }
    return [];
  },
});

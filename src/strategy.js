const config = require('./config');

// Calculate EMA from array of values
function calculateEMA(values, period) {
  if (!values || values.length === 0) return 0;
  if (values.length < period) period = values.length;
  
  const k = 2 / (period + 1);
  
  // Calculate SMA for the first EMA
  let ema = values[0];
  for (let i = 1; i < period; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

// In-memory store for trade rate calculations
// symbol -> { history: [{timestamp, count}], lastTradeCount: number }
const tradeCountStore = new Map();

function updateAndCheckTradeRate(symbol, currentTradeCount, timestamp) {
  if (!tradeCountStore.has(symbol)) {
    tradeCountStore.set(symbol, {
      history: [],
      lastTradeCount: currentTradeCount
    });
    return { isRateHigh: false, currentRate: 0, avgRate: 0 };
  }

  const store = tradeCountStore.get(symbol);
  
  // Calculate delta trades since last update
  let deltaTrades = currentTradeCount - store.lastTradeCount;
  if (deltaTrades < 0) {
    // New candle started, currentTradeCount is the total for the new candle
    deltaTrades = currentTradeCount;
  }
  
  store.lastTradeCount = currentTradeCount;

  // Add to history
  store.history.push({ ts: timestamp, count: deltaTrades });

  // Remove data older than 60s
  const windowStart = timestamp - config.TRADE_RATE_WINDOW_MS;
  while (store.history.length > 0 && store.history[0].ts < windowStart) {
    store.history.shift();
  }

  // Need at least some data to make a decision
  if (store.history.length < 2) return { isRateHigh: false, currentRate: 0, avgRate: 0 };

  // Calculate average rate over the 60s window (trades per second)
  let totalTradesWindow = 0;
  for (const item of store.history) {
    totalTradesWindow += item.count;
  }
  
  const timeSpanSeconds = (timestamp - store.history[0].ts) / 1000;
  if (timeSpanSeconds <= 0) return { isRateHigh: false, currentRate: 0, avgRate: 0 };

  const avgRatePerSec = totalTradesWindow / timeSpanSeconds;
  
  // Calculate current instantaneous rate (based on last few ticks, say last 5s max)
  let recentTrades = 0;
  let recentTimeSpanMs = 0;
  const recentWindowStart = timestamp - 5000;
  let firstRecentTs = timestamp;
  
  for (let i = store.history.length - 1; i >= 0; i--) {
    const item = store.history[i];
    if (item.ts >= recentWindowStart) {
      recentTrades += item.count;
      firstRecentTs = item.ts;
    } else {
      break;
    }
  }
  
  const recentTimeSpanSec = (timestamp - firstRecentTs) / 1000 || 1; // avoid / 0
  const currentRatePerSec = recentTrades / recentTimeSpanSec;

  const isRateHigh = currentRatePerSec > (avgRatePerSec * config.settings.TRADE_RATE_MULTIPLIER);

  return {
    isRateHigh,
    currentRate: currentRatePerSec,
    avgRate: avgRatePerSec
  };
}

module.exports = {
  calculateEMA,
  updateAndCheckTradeRate
};

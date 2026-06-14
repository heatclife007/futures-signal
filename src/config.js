const config = {
  PORT: 3000,
  
  BINANCE_REST_BASE: 'https://fapi.binance.com',
  BINANCE_WS_BASE: 'wss://fstream.binance.com/market/stream',
  
  EMA_PERIOD: 10,
  TRADE_RATE_WINDOW_MS: 60000, // 60 seconds

  // Mutable dynamic settings
  settings: {
    PRICE_ABOVE_EMA_PCT: 1.01,  // 1.01 = %1.0
    VOLUME_MULTIPLIER: 2.5,     // Active volume > last volume * 2.5
    TRADE_RATE_MULTIPLIER: 2.0, // Rate > 2.0x of 60s avg
    MIN_DURATION_SECONDS: 2,    // default 2 seconds
    MIN_24H_VOLUME: 1000000     // default 1,000,000 (1M USDT)
  },

  updateSettings: (newSettings) => {
    const p = parseFloat(newSettings.PRICE_ABOVE_EMA_PCT);
    if (!isNaN(p)) config.settings.PRICE_ABOVE_EMA_PCT = p;

    const v = parseFloat(newSettings.VOLUME_MULTIPLIER);
    if (!isNaN(v)) config.settings.VOLUME_MULTIPLIER = v;

    const t = parseFloat(newSettings.TRADE_RATE_MULTIPLIER);
    if (!isNaN(t)) config.settings.TRADE_RATE_MULTIPLIER = t;

    const d = parseFloat(newSettings.MIN_DURATION_SECONDS);
    if (!isNaN(d)) config.settings.MIN_DURATION_SECONDS = d;

    const mv = parseFloat(newSettings.MIN_24H_VOLUME);
    if (!isNaN(mv)) config.settings.MIN_24H_VOLUME = mv;
  }
};

module.exports = config;

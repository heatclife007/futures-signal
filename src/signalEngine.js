const { activeKlinesMap, volume24hMap } = require('./marketData');
const { calculateEMA, updateAndCheckTradeRate } = require('./strategy');
const { sendSignal } = require('./telegram');
const { broadcastSignal, emitLivePrice } = require('./webServer');
const config = require('./config');

const cooldownMap = new Map();
const symbolPriceHistory = new Map(); // symbol -> Array of { price, timestamp }
// Keep track of recently signaled symbols to emit live price updates
const signaledSymbols = new Set();
const signaledSymbolsList = []; // to manage size limit

function processWebsocketMessage(data) {
  if (!data) return;

  // Handle miniTicker array
  let tickerArray = null;
  if (Array.isArray(data.data)) {
    tickerArray = data.data;
  } else if (Array.isArray(data)) {
    tickerArray = data;
  }

  if (tickerArray) {
    for (const item of tickerArray) {
      if (item.e === '24hrMiniTicker') {
        const symbol = item.s;
        const volume = parseFloat(item.q);
        if (!isNaN(volume)) {
          volume24hMap.set(symbol, volume);
        }
      }
    }
    return;
  }

  if (!data.data || data.data.e !== 'kline') return;

  const klineData = data.data.k;
  const symbol = data.data.s;
  const isClosed = klineData.x; 
  const currentPrice = parseFloat(klineData.c);
  const currentVolume = parseFloat(klineData.v); // Total base asset volume
  const takerBuyVolume = parseFloat(klineData.V); // Taker buy base asset volume
  const currentTrades = klineData.n;
  const timestamp = Date.now();

  // Track sliding price history for time-based filtering
  if (!symbolPriceHistory.has(symbol)) {
    symbolPriceHistory.set(symbol, []);
  }
  const priceHistory = symbolPriceHistory.get(symbol);
  priceHistory.push({ price: currentPrice, timestamp });

  // Keep history up to max of MIN_DURATION_SECONDS and 10 seconds to cover changes
  const maxKeepWindowMs = Math.max(config.settings.MIN_DURATION_SECONDS * 1000, 10000);
  const cutoff = timestamp - maxKeepWindowMs;
  while (priceHistory.length > 0 && priceHistory[0].timestamp < cutoff) {
    priceHistory.shift();
  }

  // 1. Emit live price if this symbol is currently in our tracking list
  if (signaledSymbols.has(symbol)) {
    emitLivePrice(symbol, currentPrice);
  }

  if (!activeKlinesMap.has(symbol)) return;

  const historicalKlines = activeKlinesMap.get(symbol);
  if (historicalKlines.length === 0) return;

  const lastClosedCandle = historicalKlines[historicalKlines.length - 1];

  const period = config.EMA_PERIOD;
  const startIndex = Math.max(0, historicalKlines.length - (period - 1));
  const emaData = historicalKlines.slice(startIndex).map(k => k.close);
  emaData.push(currentPrice); 

  const liveEma = calculateEMA(emaData, period);
  const { isRateHigh, currentRate, avgRate } = updateAndCheckTradeRate(symbol, currentTrades, timestamp);

  if (isClosed) {
    historicalKlines.push({
      openTime: klineData.t,
      open: parseFloat(klineData.o),
      high: parseFloat(klineData.h),
      low: parseFloat(klineData.l),
      close: currentPrice,
      volume: currentVolume,
      closeTime: klineData.T,
      numberOfTrades: currentTrades
    });

    if (historicalKlines.length > period) {
      historicalKlines.shift();
    }

    cooldownMap.set(symbol, false);
    return; 
  }

  if (cooldownMap.get(symbol)) return;

  // Use dynamic settings from config.settings
  const priceCondition = config.settings.PRICE_ABOVE_EMA_PCT <= 0 || 
    currentPrice >= (liveEma * config.settings.PRICE_ABOVE_EMA_PCT);
    
  const volumeCondition = config.settings.VOLUME_MULTIPLIER <= 0 || 
    currentVolume > (lastClosedCandle.volume * config.settings.VOLUME_MULTIPLIER);
    
  const tradeRateCondition = config.settings.TRADE_RATE_MULTIPLIER <= 0 || 
    (currentRate > (avgRate * config.settings.TRADE_RATE_MULTIPLIER) && currentRate > 0);

  if (priceCondition && volumeCondition && tradeRateCondition) {
    // 24h Volume Filter
    const volume24h = volume24hMap.get(symbol) || 0;
    if (config.settings.MIN_24H_VOLUME > 0 && volume24h <= config.settings.MIN_24H_VOLUME) {
      console.log(`[FILTER] ${symbol} filtered out: 24h Volume ($${(volume24h / 1e6).toFixed(2)}M) <= limit ($${(config.settings.MIN_24H_VOLUME / 1e6).toFixed(2)}M)`);
      return;
    }

    // Time-based rapid rise filter
    if (config.settings.MIN_DURATION_SECONDS > 0) {
      const windowStart = timestamp - (config.settings.MIN_DURATION_SECONDS * 1000);
      const history = symbolPriceHistory.get(symbol) || [];
      let rapidRise = false;
      for (const entry of history) {
        if (entry.timestamp >= windowStart && entry.timestamp < timestamp) {
          if (currentPrice >= entry.price * 1.01) {
            rapidRise = true;
            break;
          }
        }
      }
      if (rapidRise) {
        console.log(`[FILTER] ${symbol} filtered out: Rose >= 1% in less than ${config.settings.MIN_DURATION_SECONDS}s`);
        return;
      }
    }

    cooldownMap.set(symbol, true); 

    // CVD Calculation
    const takerSellVolume = currentVolume - takerBuyVolume;
    let cvdStatus = "Nötr";
    if (takerBuyVolume > takerSellVolume) {
      cvdStatus = "Alıcılar Güçlü";
    } else if (takerSellVolume > takerBuyVolume) {
      cvdStatus = "Satıcılar Güçlü";
    }

    const openPrice = parseFloat(klineData.o);
    const priceChangePct = ((currentPrice - openPrice) / openPrice) * 100;
    const direction = priceChangePct >= 0 ? 'Yukarı' : 'Aşağı';

    const signalData = {
      id: `${symbol}-${timestamp}`, // Unique ID for the frontend
      symbol,
      price: currentPrice,
      ema: liveEma,
      activeVolume: currentVolume,
      lastVolume: lastClosedCandle.volume,
      tradeRate: currentRate,
      avgTradeRate: avgRate,
      cvdStatus,
      priceChangePct,
      direction,
      timestamp,
      volume24h
    };

    // Add to tracking list for live price updates
    if (!signaledSymbols.has(symbol)) {
      signaledSymbols.add(symbol);
      signaledSymbolsList.push(symbol);
      // Keep only last 50 symbols
      if (signaledSymbolsList.length > 50) {
        const oldest = signaledSymbolsList.shift();
        signaledSymbols.delete(oldest);
      }
    }

    sendSignal(signalData);
    broadcastSignal(signalData);
    
    console.log(`[SIGNAL] ${symbol} at ${currentPrice} | CVD: ${cvdStatus}`);
  }
}

module.exports = {
  processWebsocketMessage
};

setInterval(() => {
  console.log(`[DEBUG] Aktif Ayarlar: Fiyat=${config.settings.PRICE_ABOVE_EMA_PCT}, Hacim=${config.settings.VOLUME_MULTIPLIER}, Hiz=${config.settings.TRADE_RATE_MULTIPLIER}`);
}, 15000);

const { activeKlinesMap } = require('./marketData');
const { calculateEMA, updateAndCheckTradeRate } = require('./strategy');
const { sendSignal } = require('./telegram');
const { broadcastSignal, emitLivePrice } = require('./webServer');
const config = require('./config');

const cooldownMap = new Map();
// Keep track of recently signaled symbols to emit live price updates
const signaledSymbols = new Set();
const signaledSymbolsList = []; // to manage size limit

function processWebsocketMessage(data) {
  if (!data || !data.data || data.data.e !== 'kline') return;

  const klineData = data.data.k;
  const symbol = data.data.s;
  const isClosed = klineData.x; 
  const currentPrice = parseFloat(klineData.c);
  const currentVolume = parseFloat(klineData.v); // Total base asset volume
  const takerBuyVolume = parseFloat(klineData.V); // Taker buy base asset volume
  const currentTrades = klineData.n;
  const timestamp = Date.now();

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
      timestamp
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

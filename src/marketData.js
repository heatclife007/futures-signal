const axios = require('axios');
const config = require('./config');

const activeKlinesMap = new Map(); // symbol -> Array of last 10 closed klines (objects)

// Helper to split array into chunks
function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function getActiveSymbols() {
  try {
    const response = await axios.get(`${config.BINANCE_REST_BASE}/fapi/v1/exchangeInfo`);
    const symbols = response.data.symbols
      .filter(s => s.status === 'TRADING' && s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT')
      .map(s => s.symbol);
    return symbols;
  } catch (error) {
    console.error('Error fetching exchange info:', error.message);
    return [];
  }
}

async function fetchKlines(symbol) {
  try {
    const response = await axios.get(`${config.BINANCE_REST_BASE}/fapi/v1/klines`, {
      params: {
        symbol: symbol,
        interval: '5m',
        limit: config.EMA_PERIOD + 1
      }
    });
    
    const now = Date.now();
    let klines = response.data
      .map(k => ({
        openTime: k[0],
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
        closeTime: k[6],
        numberOfTrades: k[8]
      }))
      .filter(k => k.closeTime < now); // Keep only closed candles
    
    if (klines.length > config.EMA_PERIOD) {
      klines = klines.slice(-config.EMA_PERIOD);
    }
    
    activeKlinesMap.set(symbol, klines);
  } catch (error) {
    console.error(`Error fetching klines for ${symbol}:`, error.message);
  }
}

async function initializeMarketData() {
  console.log('Fetching active USDT-M pairs...');
  const symbols = await getActiveSymbols();
  console.log(`Found ${symbols.length} active pairs. Fetching historical data...`);
  
  // Fetch in batches to avoid rate limits
  const batches = chunkArray(symbols, 20);
  let processed = 0;
  
  for (const batch of batches) {
    await Promise.all(batch.map(sym => fetchKlines(sym)));
    processed += batch.length;
    // Small delay between batches to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 50)); 
  }
  
  console.log(`Historical data loaded for ${activeKlinesMap.size} pairs.`);
  return { symbols, activeKlinesMap };
}

module.exports = {
  initializeMarketData,
  activeKlinesMap
};

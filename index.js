const { initializeMarketData } = require('./src/marketData');
const { startWebsocketConnections } = require('./src/websocketManager');
const { startServer, updateStats } = require('./src/webServer');
const { sendStartupMessage } = require('./src/telegram');

async function main() {
  console.log('Starting Binance Futures Signal Engine...');
  
  // 1. Start Express Web Server
  startServer();

  // 2. Fetch active symbols and historical 10x 5m klines for EMA calculation
  console.log('Initializing market data...');
  const { symbols } = await initializeMarketData();
  
  if (symbols.length === 0) {
    console.error('No symbols found. Exiting.');
    process.exit(1);
  }
  
  updateStats({ activePairs: symbols.length });

  // Send startup message to Telegram
  await sendStartupMessage(symbols.length);

  // 3. Start multiplexed WebSocket connections for live tracking
  console.log('Connecting to Binance WebSocket streams...');
  startWebsocketConnections(symbols);
}

// Handle uncaught exceptions gracefully
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

main();

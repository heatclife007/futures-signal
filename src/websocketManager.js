const WebSocket = require('ws');
const config = require('./config');
const { processWebsocketMessage } = require('./signalEngine');
const { updateStats } = require('./webServer');

const MAX_STREAMS_PER_CONN = 200; // Binance max limit per connection
const connections = [];

function connectWebSocket(streamsBatch, batchIndex) {
  const streamUrl = `${config.BINANCE_WS_BASE}?streams=${streamsBatch.join('/')}`;
  let ws = new WebSocket(streamUrl);

  ws.on('open', () => {
    console.log(`WS Connection #${batchIndex} opened with ${streamsBatch.length} streams.`);
    updateStats({ wsConnections: connections.filter(c => c && c.readyState === WebSocket.OPEN).length + 1 });
  });

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      processWebsocketMessage(message);
    } catch (e) {
      console.error(`Error parsing WS message on batch #${batchIndex}:`, e.message);
    }
  });

  ws.on('ping', () => {
    ws.pong();
  });

  ws.on('close', () => {
    console.log(`WS Connection #${batchIndex} closed. Reconnecting in 5 seconds...`);
    updateStats({ wsConnections: connections.filter(c => c && c.readyState === WebSocket.OPEN).length - 1 });
    // Reconnect logic
    setTimeout(() => {
      connectWebSocket(streamsBatch, batchIndex);
    }, 5000);
  });

  ws.on('error', (err) => {
    console.error(`WS Connection #${batchIndex} error:`, err.message);
    ws.close();
  });

  connections[batchIndex] = ws;
}

function startWebsocketConnections(symbols) {
  // We need streams in the format: <symbol>@kline_5m
  const streams = symbols.map(s => `${s.toLowerCase()}@kline_5m`);
  
  // Split into chunks of 200
  for (let i = 0; i < streams.length; i += MAX_STREAMS_PER_CONN) {
    const batch = streams.slice(i, i + MAX_STREAMS_PER_CONN);
    const batchIndex = Math.floor(i / MAX_STREAMS_PER_CONN);
    connectWebSocket(batch, batchIndex);
  }
}

module.exports = {
  startWebsocketConnections
};

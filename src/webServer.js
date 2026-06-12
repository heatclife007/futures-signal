const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const axios = require('axios');
const config = require('./config');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.json()); // To parse JSON bodies
app.use(express.static(path.join(__dirname, '../public')));

let serverStats = {
  activePairs: 0,
  wsConnections: 0,
  totalSignals: 0
};

// GET status
app.get('/api/status', (req, res) => {
  res.json(serverStats);
});

// GET Settings
app.get('/api/settings', (req, res) => {
  res.json(config.settings);
});

// PUT Settings (Update dynamically)
app.put('/api/settings', (req, res) => {
  try {
    config.updateSettings(req.body);
    res.json({ success: true, settings: config.settings });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// GET 24h Ticker for a symbol
app.get('/api/ticker24/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol;
    const response = await axios.get(`${config.BINANCE_REST_BASE}/fapi/v1/ticker/24hr`, {
      params: { symbol: symbol }
    });
    res.json(response.data);
  } catch (error) {
    console.error(`Error fetching 24h ticker for ${req.params.symbol}:`, error.message);
    res.status(500).json({ error: 'Failed to fetch 24h ticker' });
  }
});

function updateStats(stats) {
  serverStats = { ...serverStats, ...stats };
  io.emit('stats_update', serverStats);
}

function broadcastSignal(signalData) {
  serverStats.totalSignals++;
  io.emit('signal', signalData);
  io.emit('stats_update', serverStats);
}

function emitLivePrice(symbol, price) {
  io.emit('price_update', { symbol, price });
}

function startServer() {
  server.listen(config.PORT, () => {
    console.log(`Web Dashboard running on http://localhost:${config.PORT}`);
  });
}

module.exports = {
  startServer,
  broadcastSignal,
  updateStats,
  emitLivePrice
};

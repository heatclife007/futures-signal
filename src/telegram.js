const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');

const TELEGRAM_BOT_TOKEN = '8903535792:AAG-7J0SgovfzuHcTlTAZD2jsvk3mbtfCgc';
const TELEGRAM_CHAT_ID = '-1003871871251';

let bot = null;

if (TELEGRAM_BOT_TOKEN) {
  bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });
}

async function sendSignal(signalData) {
  if (!bot || !TELEGRAM_CHAT_ID) return;

  const cvdIcon = signalData.cvdStatus === 'Alıcılar Güçlü' ? '🟢' : '🔴';
  const directionIcon = signalData.priceChangePct >= 0 ? '📈' : '📉';
  const directionText = signalData.priceChangePct >= 0 ? 'Yükseliş' : 'Düşüş';

  const timeStr = new Date(signalData.timestamp).toLocaleTimeString('tr-TR', { 
    timeZone: 'Europe/Istanbul', 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  });

  const message = `🚀 <b>#${signalData.symbol.replace('USDT', '')}</b> | <b>${signalData.price} USDT</b>

🧭 <b>Yön:</b> ${directionIcon} ${directionText} (${signalData.priceChangePct >= 0 ? '+' : ''}${signalData.priceChangePct.toFixed(2)}%)
⚖️ <b>CVD:</b> ${cvdIcon} ${signalData.cvdStatus}
⚡ <b>Hız:</b> ${(signalData.tradeRate / Math.max(0.001, signalData.avgTradeRate)).toFixed(1)}x
📊 <b>Hacim (Aktif/Son):</b> ${signalData.activeVolume.toFixed(0)} / ${signalData.lastVolume.toFixed(0)}
🕐 <b>Zaman:</b> ${timeStr}`;

  try {
    await bot.sendMessage(TELEGRAM_CHAT_ID, message, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Error sending Telegram message:', error.message);
  }
}

async function sendStartupMessage(coinCount) {
  if (!bot || !TELEGRAM_CHAT_ID) return;
  const message = `🟢 <b>Sistem Başlatıldı!</b>\n\n🤖 Binance Futures Sinyal Botu aktif hale geldi.\n📊 Anlık olarak <b>${coinCount}</b> adet parite (coin) izleniyor.\n\nSinyaller bekleniyor...`;
  try {
    await bot.sendMessage(TELEGRAM_CHAT_ID, message, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Error sending Telegram startup message:', error.message);
  }
}

module.exports = {
  sendSignal,
  sendStartupMessage
};

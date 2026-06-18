const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const http = require('http');

// Токен Telegram-бота берём из окружения (systemd Environment=TELEGRAM_TOKEN=...),
// чтобы он не лежал в коде/репозитории.
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || '';
if (!TELEGRAM_TOKEN) {
  console.error('TELEGRAM_TOKEN не задан в окружении — бот не запущен.');
  process.exit(1);
}
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

const server = http.createServer();
const wss = new WebSocket.Server({ server });

let sockets = [];
wss.on('connection', (ws) => {
  sockets.push(ws);
  ws.on('close', () => {
    sockets = sockets.filter(s => s !== ws);
  });
});

function broadcast(data) {
  const str = JSON.stringify(data);
  sockets.forEach(s => {
    try { s.send(str); } catch { }
  });
}

// Когда в бота пришло сообщение — шлем его на фронт
bot.on('message', (msg) => {
  console.log('NEW MESSAGE:', msg); // <--- вот эта строка!
  const notification = {
    id: msg.message_id,
    text: msg.text,
    from: msg.from.username || msg.from.first_name || "Гость",
    date: new Date(msg.date * 1000),
  };
  broadcast(notification);
});


// Сервер на 8080
server.listen(8080, () => {
  console.log('WebSocket + Telegram bot сервер слушает порт 8080');
});

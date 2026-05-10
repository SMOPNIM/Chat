const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const cookieParser = require('cookie-parser');
const path = require('path');
const db = require('./db');
const authRouter = require('./auth');

const clients = {};

async function main() {
  await db.init();

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(express.static(path.join(__dirname, 'public')));
  app.use('/api', authRouter);

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws, req) => {
    const cookies = parseCookies(req.headers.cookie || '');
    const token = cookies.session_token;
    if (!token) {
      ws.close(4001, 'Not authenticated');
      return;
    }
    const session = db.getSession(token);
    if (!session) {
      ws.close(4001, 'Invalid session');
      return;
    }

    const username = session.username;
    if (clients[username]) {
      clients[username].ws.close(4002, '已在其他设备登录');
    }
    clients[username] = { ws, userId: session.user_id };

    broadcastUsers();
    broadcastSystem(`${username} 进入了聊天室`);

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        handleMessage(username, msg);
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: '消息格式错误' }));
      }
    });

    ws.on('close', () => {
      if (clients[username] && clients[username].ws === ws) {
        delete clients[username];
        broadcastUsers();
        broadcastSystem(`${username} 离开了聊天室`);
      }
    });
  });

  function handleMessage(from, msg) {
    if (msg.type !== 'message') return;
    const target = msg.to || 'public';
    const content = msg.content;
    if (!content || !content.trim()) return;

    const message = {
      type: 'message',
      from,
      to: target,
      content: content.trim(),
      time: new Date().toISOString()
    };

    if (target === 'public') {
      broadcast(message);
    } else {
      const recipient = clients[target];
      if (recipient) {
        recipient.ws.send(JSON.stringify(message));
      }
      const sender = clients[from];
      if (sender) {
        sender.ws.send(JSON.stringify(message));
      }
    }
  }

  function broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const name in clients) {
      try {
        clients[name].ws.send(data);
      } catch {
        // ignore disconnected clients
      }
    }
  }

  function broadcastSystem(content) {
    broadcast({ type: 'system', content, time: new Date().toISOString() });
  }

  function broadcastUsers() {
    const list = Object.keys(clients);
    broadcast({ type: 'users', list });
  }

  function parseCookies(str) {
    const obj = {};
    if (!str) return obj;
    str.split(';').forEach(c => {
      const [key, ...val] = c.trim().split('=');
      if (key) obj[key.trim()] = val.join('=');
    });
    return obj;
  }

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`聊天服务已启动: http://localhost:${PORT}`);
  });
}

main().catch(console.error);

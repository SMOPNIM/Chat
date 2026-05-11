const express = require('express');
const http = require('http');
const https = require('https');
const { WebSocketServer } = require('ws');
const cookieParser = require('cookie-parser');
const path = require('path');
const db = require('./db');
const authRouter = require('./auth');
const GIPHY_API_KEY = process.env.GIPHY_API_KEY || '';

const clients = {};

async function main() {
  await db.init();

  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());
  app.use(express.static(path.join(__dirname, 'public')));
  app.use('/api', authRouter);

  function giphyFetch(path) {
    return new Promise((resolve, reject) => {
      https.get(`https://api.giphy.com${path}`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error('Invalid JSON')); }
        });
      }).on('error', reject);
    });
  }

  app.get('/api/gif/trending', async (req, res) => {
    if (!GIPHY_API_KEY) return res.json({ data: [] });
    try {
      const result = await giphyFetch(`/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=20&offset=${parseInt(req.query.offset) || 0}&rating=g`);
      res.json(result);
    } catch { res.json({ data: [] }); }
  });

  app.get('/api/gif/search', async (req, res) => {
    if (!GIPHY_API_KEY) return res.json({ data: [] });
    const q = req.query.q;
    if (!q) return res.json({ data: [] });
    try {
      const result = await giphyFetch(`/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(q)}&limit=20&offset=${parseInt(req.query.offset) || 0}&rating=g`);
      res.json(result);
    } catch { res.json({ data: [] }); }
  });

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
    const userId = session.user_id;
    if (clients[username]) {
      clients[username].ws.close(4002, '已在其他设备登录');
    }
    clients[username] = { ws, userId };

    broadcastUsers();
    broadcastSystem(`${username} 进入了聊天室`);

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        handleMessage(username, userId, msg);
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

  function handleMessage(from, userId, msg) {
    switch (msg.type) {
      case 'message': {
        const target = msg.to || 'public';
        const content = msg.content;
        if (!content || !content.trim()) return;

        if (target === 'public') {
          const message = {
            type: 'message',
            from,
            to: 'public',
            content: content.trim(),
            time: new Date().toISOString()
          };
          broadcast(message);
          checkMentions(message);
          return;
        }

        if (target.startsWith('group:')) {
          const groupId = target.split(':')[1];
          if (!db.isGroupMember(groupId, userId)) {
            wsSend(from, { type: 'error', message: '你不是该群成员' });
            return;
          }
          const group = db.getGroupById(groupId);
          if (!group) {
            wsSend(from, { type: 'error', message: '群组不存在' });
            return;
          }
          const message = {
            type: 'group_message',
            group: groupId,
            groupName: group.name,
            from,
            content: content.trim(),
            time: new Date().toISOString()
          };
          const members = db.getGroupMembers(groupId);
          const data = JSON.stringify(message);
          for (const member of members) {
            const client = clients[member.username];
            if (client) {
              try { client.ws.send(data); } catch {}
            }
          }
          checkMentions(message);
          return;
        }

        const targetUser = db.getUserByUsername(target);
        if (!targetUser) {
          wsSend(from, { type: 'error', message: '用户不存在' });
          return;
        }
        if (!db.areFriends(userId, targetUser.id)) {
          wsSend(from, { type: 'error', message: '你们不是好友，无法私聊' });
          return;
        }

        const message = {
          type: 'private_message',
          from,
          to: target,
          content: content.trim(),
          time: new Date().toISOString()
        };
        const data = JSON.stringify(message);
        const recipient = clients[target];
        if (recipient) {
          try { recipient.ws.send(data); } catch {}
        }
        const sender = clients[from];
        if (sender) {
          try { sender.ws.send(data); } catch {}
        }
        break;
      }

      case 'friend_request': {
        const targetUser = db.getUserByUsername(msg.to);
        if (!targetUser) {
          wsSend(from, { type: 'error', message: '用户不存在' });
          return;
        }
        const recipient = clients[msg.to];
        if (recipient) {
          try {
            recipient.ws.send(JSON.stringify({
              type: 'friend_request',
              from
            }));
          } catch {}
        }
        break;
      }

      case 'friend_accept': {
        const recipient = clients[msg.to];
        if (recipient) {
          try {
            recipient.ws.send(JSON.stringify({
              type: 'friend_accept',
              from
            }));
          } catch {}
        }
        break;
      }
    }
  }

  function checkMentions(msg) {
    const mentionRegex = /@(\w{2,20})/g;
    let match;
    while ((match = mentionRegex.exec(msg.content)) !== null) {
      const mentioned = match[1];
      const client = clients[mentioned];
      if (client && mentioned !== msg.from) {
        try {
          client.ws.send(JSON.stringify({
            type: 'mention',
            from: msg.from,
            chat: msg.to || msg.group || 'public',
            content: msg.content,
            time: msg.time
          }));
        } catch {}
      }
    }
  }

  function wsSend(username, msg) {
    const client = clients[username];
    if (client) {
      try { client.ws.send(JSON.stringify(msg)); } catch {}
    }
  }

  function broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const name in clients) {
      try { clients[name].ws.send(data); } catch {}
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

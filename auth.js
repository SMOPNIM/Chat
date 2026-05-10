const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

const router = express.Router();

router.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }
  if (username.length < 2 || username.length > 20) {
    return res.status(400).json({ error: '用户名长度应在 2-20 个字符之间' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: '密码长度至少 4 个字符' });
  }
  const existing = db.getUserByUsername(username);
  if (existing) {
    return res.status(409).json({ error: '用户名已存在' });
  }
  const hashed = await bcrypt.hash(password, 10);
  db.createUser(username, hashed);
  const user = db.getUserByUsername(username);
  const token = uuidv4();
  db.createSession(token, user.id, username);
  res.cookie('session_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
  res.json({ username });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }
  const user = db.getUserByUsername(username);
  if (!user) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  const token = uuidv4();
  db.createSession(token, user.id, username);
  res.cookie('session_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
  res.json({ username });
});

router.get('/me', (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) return res.status(401).json({ error: '未登录' });
  const session = db.getSession(token);
  if (!session) return res.status(401).json({ error: '会话已过期' });
  res.json({ username: session.username, userId: session.user_id });
});

router.post('/logout', (req, res) => {
  const token = req.cookies?.session_token;
  if (token) {
    db.deleteSession(token);
    res.clearCookie('session_token');
  }
  res.json({ ok: true });
});

module.exports = router;

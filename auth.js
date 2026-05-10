const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

const router = express.Router();

function getSessionUser(req) {
  const token = req.cookies?.session_token;
  if (!token) return null;
  return db.getSession(token);
}

function requireAuth(req, res, next) {
  const session = getSessionUser(req);
  if (!session) return res.status(401).json({ error: '未登录' });
  req.session = session;
  next();
}

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
    httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000
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
    httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000
  });
  res.json({ username });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ username: req.session.username, userId: req.session.user_id });
});

router.post('/logout', (req, res) => {
  const token = req.cookies?.session_token;
  if (token) {
    db.deleteSession(token);
    res.clearCookie('session_token');
  }
  res.json({ ok: true });
});

// --- User Search ---
router.get('/users/search', requireAuth, (req, res) => {
  const q = req.query.q || '';
  if (!q.trim()) return res.json([]);
  const users = db.searchUsers(q.trim(), req.session.user_id);
  const friends = db.getFriends(req.session.user_id);
  const friendIds = new Set(friends.map(f => f.id));
  const results = users.map(u => ({
    id: u.id,
    username: u.username,
    isFriend: friendIds.has(u.id)
  }));
  res.json(results);
});

// --- Friends ---
router.get('/friends', requireAuth, (req, res) => {
  const friends = db.getFriends(req.session.user_id);
  res.json(friends);
});

router.get('/friends/requests', requireAuth, (req, res) => {
  const requests = db.getPendingRequests(req.session.user_id);
  res.json(requests);
});

router.post('/friends/request', requireAuth, (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: '缺少用户名' });
  if (username === req.session.username) return res.status(400).json({ error: '不能添加自己为好友' });
  const target = db.getUserByUsername(username);
  if (!target) return res.status(404).json({ error: '用户不存在' });
  const status = db.getFriendshipStatus(req.session.user_id, target.id);
  if (status === 'accepted') return res.status(409).json({ error: '已经是好友了' });
  if (status === 'pending') return res.status(409).json({ error: '已发送过好友请求' });
  db.sendFriendRequest(req.session.user_id, target.id);
  res.json({ ok: true });
});

router.post('/friends/accept', requireAuth, (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: '缺少用户名' });
  const target = db.getUserByUsername(username);
  if (!target) return res.status(404).json({ error: '用户不存在' });
  db.acceptFriendRequest(req.session.user_id, target.id);
  res.json({ ok: true });
});

router.post('/friends/reject', requireAuth, (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: '缺少用户名' });
  const target = db.getUserByUsername(username);
  if (!target) return res.status(404).json({ error: '用户不存在' });
  db.rejectFriendRequest(req.session.user_id, target.id);
  res.json({ ok: true });
});

router.delete('/friends/:username', requireAuth, (req, res) => {
  const target = db.getUserByUsername(req.params.username);
  if (!target) return res.status(404).json({ error: '用户不存在' });
  db.deleteFriend(req.session.user_id, target.id);
  res.json({ ok: true });
});

// --- Groups ---
router.post('/groups', requireAuth, (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: '群名不能为空' });
  if (name.length > 30) return res.status(400).json({ error: '群名最长 30 个字符' });
  const groupId = db.createGroup(name.trim(), req.session.user_id);
  const group = db.getGroupById(groupId);
  res.json({ id: group.id, name: group.name });
});

router.get('/groups', requireAuth, (req, res) => {
  const groups = db.getUserGroups(req.session.user_id);
  res.json(groups);
});

router.get('/groups/:id/members', requireAuth, (req, res) => {
  const members = db.getGroupMembers(req.params.id);
  res.json(members);
});

router.post('/groups/:id/invite', requireAuth, (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: '缺少用户名' });
  if (!db.isGroupMember(req.params.id, req.session.user_id)) {
    return res.status(403).json({ error: '你不是群成员' });
  }
  const target = db.getUserByUsername(username);
  if (!target) return res.status(404).json({ error: '用户不存在' });
  if (db.isGroupMember(req.params.id, target.id)) {
    return res.status(409).json({ error: '该用户已在群中' });
  }
  db.addGroupMember(req.params.id, target.id);
  res.json({ ok: true });
});

router.post('/groups/:id/leave', requireAuth, (req, res) => {
  if (!db.isGroupMember(req.params.id, req.session.user_id)) {
    return res.status(403).json({ error: '你不是群成员' });
  }
  db.removeGroupMember(req.params.id, req.session.user_id);
  res.json({ ok: true });
});

module.exports = router;

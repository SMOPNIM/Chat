const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'chat.db');
let database = null;

async function init() {
  if (database) return database;
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    database = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    database = new SQL.Database();
  }
  database.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  database.run(`CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  database.run(`CREATE TABLE IF NOT EXISTS friends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    friend_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  database.run(`CREATE TABLE IF NOT EXISTS groups_t (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    creator_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  database.run(`CREATE TABLE IF NOT EXISTS group_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at TEXT DEFAULT (datetime('now'))
  )`);
  save();
  return database;
}

function save() {
  if (database) {
    const data = database.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  }
}

function createUser(username, hashedPassword) {
  database.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword]);
  save();
}

function getUserByUsername(username) {
  const stmt = database.prepare('SELECT * FROM users WHERE username = ?');
  stmt.bind([username]);
  let user = null;
  if (stmt.step()) {
    user = stmt.getAsObject();
  }
  stmt.free();
  return user;
}

function getUserById(id) {
  const stmt = database.prepare('SELECT id, username, created_at FROM users WHERE id = ?');
  stmt.bind([id]);
  let user = null;
  if (stmt.step()) {
    user = stmt.getAsObject();
  }
  stmt.free();
  return user;
}

function createSession(token, userId, username) {
  database.run('INSERT INTO sessions (token, user_id, username) VALUES (?, ?, ?)', [token, userId, username]);
  save();
}

function getSession(token) {
  const stmt = database.prepare('SELECT * FROM sessions WHERE token = ?');
  stmt.bind([token]);
  let session = null;
  if (stmt.step()) {
    session = stmt.getAsObject();
  }
  stmt.free();
  return session;
}

function deleteSession(token) {
  database.run('DELETE FROM sessions WHERE token = ?', [token]);
  save();
}

function searchUsers(query, excludeId) {
  const stmt = database.prepare("SELECT id, username FROM users WHERE username LIKE ? AND id != ? LIMIT 20");
  stmt.bind([`%${query}%`, excludeId]);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function sendFriendRequest(userId, friendId) {
  database.run('INSERT INTO friends (user_id, friend_id, status) VALUES (?, ?, ?)', [userId, friendId, 'pending']);
  database.run('INSERT INTO friends (user_id, friend_id, status) VALUES (?, ?, ?)', [friendId, userId, 'pending']);
  save();
}

function acceptFriendRequest(userId, friendId) {
  database.run("UPDATE friends SET status = 'accepted' WHERE user_id = ? AND friend_id = ?", [userId, friendId]);
  database.run("UPDATE friends SET status = 'accepted' WHERE user_id = ? AND friend_id = ?", [friendId, userId]);
  save();
}

function rejectFriendRequest(userId, friendId) {
  database.run("DELETE FROM friends WHERE user_id = ? AND friend_id = ?", [userId, friendId]);
  database.run("DELETE FROM friends WHERE user_id = ? AND friend_id = ?", [friendId, userId]);
  save();
}

function getFriends(userId) {
  const stmt = database.prepare(`
    SELECT u.id, u.username FROM friends f
    JOIN users u ON u.id = f.friend_id
    WHERE f.user_id = ? AND f.status = 'accepted'
  `);
  stmt.bind([userId]);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function getPendingRequests(userId) {
  const stmt = database.prepare(`
    SELECT u.id, u.username FROM friends f
    JOIN users u ON u.id = f.user_id
    WHERE f.friend_id = ? AND f.status = 'pending' AND f.user_id != ?
  `);
  // We need to find requests where the OTHER person initiated
  // A pending record with user_id = requester and friend_id = recipient
  // But we have two rows per friendship. The "incoming" request for userId
  // is a record where friend_id = userId and user_id != userId
  stmt.bind([userId, userId]);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function areFriends(userId1, userId2) {
  const stmt = database.prepare(
    "SELECT id FROM friends WHERE user_id = ? AND friend_id = ? AND status = 'accepted'"
  );
  stmt.bind([userId1, userId2]);
  const result = stmt.step();
  stmt.free();
  return result;
}

function deleteFriend(userId1, userId2) {
  database.run("DELETE FROM friends WHERE user_id = ? AND friend_id = ?", [userId1, userId2]);
  database.run("DELETE FROM friends WHERE user_id = ? AND friend_id = ?", [userId2, userId1]);
  save();
}

function getFriendshipStatus(userId, friendId) {
  const stmt = database.prepare(
    "SELECT status FROM friends WHERE user_id = ? AND friend_id = ?"
  );
  stmt.bind([userId, friendId]);
  let status = null;
  if (stmt.step()) {
    status = stmt.getAsObject().status;
  }
  stmt.free();
  return status;
}

function createGroup(name, creatorId) {
  database.run('INSERT INTO groups_t (name, creator_id) VALUES (?, ?)', [name, creatorId]);
  const stmt = database.prepare('SELECT id FROM groups_t WHERE name = ? AND creator_id = ? ORDER BY id DESC LIMIT 1');
  stmt.bind([name, creatorId]);
  stmt.step();
  const groupId = stmt.getAsObject().id;
  stmt.free();
  database.run("INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'owner')", [groupId, creatorId]);
  save();
  return groupId;
}

function addGroupMember(groupId, userId) {
  database.run("INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'member')", [groupId, userId]);
  save();
}

function removeGroupMember(groupId, userId) {
  database.run("DELETE FROM group_members WHERE group_id = ? AND user_id = ?", [groupId, userId]);
  save();
}

function getUserGroups(userId) {
  const stmt = database.prepare(`
    SELECT g.id, g.name, g.creator_id,
      (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count
    FROM groups_t g
    JOIN group_members gm ON gm.group_id = g.id
    WHERE gm.user_id = ?
  `);
  stmt.bind([userId]);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function getGroupMembers(groupId) {
  const stmt = database.prepare(`
    SELECT u.id, u.username, gm.role FROM group_members gm
    JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ?
  `);
  stmt.bind([groupId]);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function getGroupById(groupId) {
  const stmt = database.prepare('SELECT * FROM groups_t WHERE id = ?');
  stmt.bind([groupId]);
  let group = null;
  if (stmt.step()) {
    group = stmt.getAsObject();
  }
  stmt.free();
  return group;
}

function isGroupMember(groupId, userId) {
  const stmt = database.prepare("SELECT id FROM group_members WHERE group_id = ? AND user_id = ?");
  stmt.bind([groupId, userId]);
  const result = stmt.step();
  stmt.free();
  return result;
}

module.exports = {
  init, save,
  createUser, getUserByUsername, getUserById,
  createSession, getSession, deleteSession,
  searchUsers,
  sendFriendRequest, acceptFriendRequest, rejectFriendRequest,
  getFriends, getPendingRequests, areFriends, deleteFriend, getFriendshipStatus,
  createGroup, addGroupMember, removeGroupMember,
  getUserGroups, getGroupMembers, getGroupById, isGroupMember
};

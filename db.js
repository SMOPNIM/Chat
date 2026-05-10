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
  const stmt = database.prepare('SELECT * FROM users WHERE id = ?');
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

module.exports = { init, save, createUser, getUserByUsername, getUserById, createSession, getSession, deleteSession };

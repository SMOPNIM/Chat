# Chat — Agent Guide

## Quick start
```bash
npm install
npm start          # or: npm run dev (identical)
```
Server listens on `http://localhost:3000` (override with `PORT` env).

## Project structure
- `server.js` — Express + WebSocket entrypoint, all WS message routing
- `auth.js` — REST routes for register/login/logout, friends, groups
- `db.js` — SQLite via `sql.js`, persisted to `chat.db` (gitignored)
- `public/` — Vanilla HTML/CSS/JS frontend, served as static files
  - `index.html` — login/register page
  - `chat.html` — main chat UI (with CDN-loaded marked, KaTeX, DOMPurify)
  - `js/auth.js`, `js/chat.js` — client logic

## Commands
- `npm start` / `npm run dev` — start the server (same thing)
- No test runner, linter, typechecker, or build step exists.

## Architecture notes
- Session auth: UUID tokens stored in `httpOnly` cookies (`session_token`), 7-day expiry
- WebSocket path is the default (`/`), authenticated via cookie on upgrade
- WS messages are JSON with `type` field: `message`, `private_message`, `group_message`, `friend_request`, `friend_accept`, etc.
- Friendship uses bidirectional rows in `friends` table (two rows per pair)
- Image upload is Base64-embedded in message content (limited to 10MB via `express.json({ limit: '10mb' })`)
- GIF support via GIPHY API: set `GIPHY_API_KEY` env var to enable the GIF search panel
  - Get a key at https://developers.giphy.com (free tier)
  - Without the key, the GIF panel shows "加载中..." indefinitely
- GIFs: upload limit 20MB (vs 5MB for static images); GIF badge + play/pause on hover
- UI language is Chinese (zh-CN)
- Database is auto-created + migrated on first `require('./db')` — no migration tooling

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'lara.db');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

// Create table if not exists
db.exec(`
  CREATE TABLE IF NOT EXISTS user_tokens (
    session_id TEXT PRIMARY KEY,
    refresh_token TEXT NOT NULL,
    email TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

/**
 * Save or update a user's refresh token.
 * @param {string} sessionId
 * @param {string} refreshToken
 * @param {string} [email]
 */
function saveToken(sessionId, refreshToken, email = null) {
  const stmt = db.prepare(`
    INSERT INTO user_tokens (session_id, refresh_token, email)
    VALUES (?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET
      refresh_token = excluded.refresh_token,
      email = COALESCE(excluded.email, user_tokens.email),
      updated_at = datetime('now')
  `);
  stmt.run(sessionId, refreshToken, email);
}

/**
 * Get a user's refresh token.
 * @param {string} sessionId
 * @returns {string|null}
 */
function getToken(sessionId) {
  const row = db.prepare('SELECT refresh_token FROM user_tokens WHERE session_id = ?').get(sessionId);
  return row?.refresh_token || null;
}

/**
 * Check if a session has a stored token.
 * @param {string} sessionId
 * @returns {boolean}
 */
function hasToken(sessionId) {
  const row = db.prepare('SELECT 1 FROM user_tokens WHERE session_id = ?').get(sessionId);
  return !!row;
}

/**
 * Delete a user's token (disconnect).
 * @param {string} sessionId
 */
function deleteToken(sessionId) {
  db.prepare('DELETE FROM user_tokens WHERE session_id = ?').run(sessionId);
}

export { saveToken, getToken, hasToken, deleteToken };

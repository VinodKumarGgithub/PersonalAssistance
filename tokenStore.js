import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'lara.db');

// ─── AES-256-GCM Encryption Setup ─────────────────────────

const RAW_KEY = process.env.ENCRYPTION_KEY;
if (!RAW_KEY) {
  throw new Error('ENCRYPTION_KEY is required but not set in .env');
}
const KEY = crypto.createHash('sha256').update(String(RAW_KEY)).digest();
const ALGORITHM = 'aes-256-gcm';

/**
 * Encrypts sensitive text (e.g. refresh token) using AES-256-GCM.
 * @param {string} text
 * @returns {string} Encrypted string format -> iv:authTag:encryptedData
 */
function encrypt(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts AES-256-GCM encrypted text.
 * Falls back gracefully if token was saved unencrypted.
 * @param {string} encryptedText
 * @returns {string|null}
 */
function decrypt(encryptedText) {
  if (!encryptedText) return null;
  try {
    const parts = encryptedText.split(':');
    // If not in iv:authTag:data format, handle as raw string for backwards compatibility
    if (parts.length !== 3) {
      return encryptedText;
    }
    const [ivHex, authTagHex, encryptedData] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('⚠️  Failed to decrypt token:', err.message);
    return null;
  }
}

// ─── SQLite Setup ──────────────────────────────────────────

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better performance
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
 * Save or update a user's refresh token (encrypted at rest).
 * @param {string} sessionId
 * @param {string} refreshToken
 * @param {string} [email]
 */
function saveToken(sessionId, refreshToken, email = null) {
  const encryptedToken = encrypt(refreshToken);
  const stmt = db.prepare(`
    INSERT INTO user_tokens (session_id, refresh_token, email)
    VALUES (?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET
      refresh_token = excluded.refresh_token,
      email = COALESCE(excluded.email, user_tokens.email),
      updated_at = datetime('now')
  `);
  stmt.run(sessionId, encryptedToken, email);
}

/**
 * Get a user's refresh token (decrypted in memory).
 * @param {string} sessionId
 * @returns {string|null}
 */
function getToken(sessionId) {
  const row = db.prepare('SELECT refresh_token FROM user_tokens WHERE session_id = ?').get(sessionId);
  if (!row?.refresh_token) return null;
  return decrypt(row.refresh_token);
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

import { DatabaseSync } from 'node:sqlite';
import { timingSafeEqual } from 'node:crypto';

const CODE_LIFETIME = 10 * 60 * 1000;
const SEND_COOLDOWN = 60 * 1000;

function sameHash(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left, 'hex'), b = Buffer.from(right, 'hex');
  return a.length === 32 && b.length === 32 && timingSafeEqual(a, b);
}

export function createStore(path) {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL, email_verified_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS birth_profiles (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      birth_date TEXT NOT NULL, birth_time TEXT NOT NULL, birth_place TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_challenges (
      challenge_hash TEXT PRIMARY KEY, purpose TEXT NOT NULL CHECK(purpose IN ('registration','verify','reset')),
      email TEXT NOT NULL, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      password_hash TEXT, code_hash TEXT NOT NULL, expires_at INTEGER NOT NULL,
      attempts_left INTEGER NOT NULL, last_sent_at INTEGER NOT NULL,
      UNIQUE(purpose, email)
    );
    CREATE INDEX IF NOT EXISTS auth_challenges_expiry ON auth_challenges(expires_at);
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS daily_quotas (
      kind TEXT NOT NULL, day TEXT NOT NULL, used INTEGER NOT NULL,
      PRIMARY KEY(kind, day)
    );
  `);
  // Existing local databases from the first account iteration lacked this column.
  const columns = db.prepare('PRAGMA table_info(users)').all().map((row) => row.name);
  if (!columns.includes('email_verified_at')) db.exec('ALTER TABLE users ADD COLUMN email_verified_at INTEGER');

  function createUser(email, passwordHash, now = Date.now(), verifiedAt = null) {
    const result = db.prepare('INSERT INTO users (email, password_hash, created_at, email_verified_at) VALUES (?, ?, ?, ?)')
      .run(email, passwordHash, now, verifiedAt);
    return { id: Number(result.lastInsertRowid), email, emailVerified: verifiedAt !== null };
  }

  function findUserByEmail(email) {
    return db.prepare('SELECT id, email, password_hash, email_verified_at FROM users WHERE email = ?').get(email) ?? null;
  }

  function findUserById(id) {
    return db.prepare('SELECT id, email, email_verified_at FROM users WHERE id = ?').get(id) ?? null;
  }

  function saveSession(hash, userId, expiresAt) {
    db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(hash, userId, expiresAt);
  }

  function userForSession(hash, now = Date.now()) {
    const row = db.prepare(`SELECT users.id, users.email, users.email_verified_at FROM sessions
      JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?`).get(hash, now);
    return row ? { id: row.id, email: row.email, emailVerified: row.email_verified_at !== null } : null;
  }

  function deleteSession(hash) { db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash); }

  function getBirthProfile(userId) {
    return db.prepare('SELECT birth_date AS birthDate, birth_time AS birthTime, birth_place AS birthPlace FROM birth_profiles WHERE user_id = ?').get(userId) ?? null;
  }

  function saveBirthProfile(userId, profile, now = Date.now()) {
    db.prepare(`INSERT INTO birth_profiles (user_id, birth_date, birth_time, birth_place, updated_at)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET birth_date = excluded.birth_date,
      birth_time = excluded.birth_time, birth_place = excluded.birth_place, updated_at = excluded.updated_at`)
      .run(userId, profile.birthDate, profile.birthTime, profile.birthPlace, now);
    return getBirthProfile(userId);
  }

  function issueChallenge({ challengeHash, purpose, email, userId = null, passwordHash = null, codeHash }, now = Date.now()) {
    const previous = db.prepare('SELECT last_sent_at FROM auth_challenges WHERE purpose = ? AND email = ?').get(purpose, email);
    if (previous && now - previous.last_sent_at < SEND_COOLDOWN) return false;
    db.prepare(`INSERT INTO auth_challenges
      (challenge_hash, purpose, email, user_id, password_hash, code_hash, expires_at, attempts_left, last_sent_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 5, ?)
      ON CONFLICT(purpose, email) DO UPDATE SET challenge_hash = excluded.challenge_hash,
      user_id = excluded.user_id, password_hash = excluded.password_hash, code_hash = excluded.code_hash,
      expires_at = excluded.expires_at, attempts_left = 5, last_sent_at = excluded.last_sent_at`)
      .run(challengeHash, purpose, email, userId, passwordHash, codeHash, now + CODE_LIFETIME, now);
    return true;
  }

  function deleteChallenge(challengeHash) {
    db.prepare('DELETE FROM auth_challenges WHERE challenge_hash = ?').run(challengeHash);
  }

  function consumeDailyQuota(kind, day, limit) {
    if (!Number.isSafeInteger(limit) || limit < 1) return false;
    const result = db.prepare(`INSERT INTO daily_quotas (kind, day, used) VALUES (?, ?, 1)
      ON CONFLICT(kind, day) DO UPDATE SET used = used + 1 WHERE used < ?`).run(kind, day, limit);
    return result.changes === 1;
  }

  function consumeChallenge(challengeHash, codeHash, purpose, now = Date.now(), nextPasswordHash = null, expectedUserId = null) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const row = db.prepare('SELECT * FROM auth_challenges WHERE challenge_hash = ? AND purpose = ?').get(challengeHash, purpose);
      if (!row || row.expires_at <= now || row.attempts_left <= 0
        || (purpose !== 'registration' && row.user_id === null)
        || (expectedUserId !== null && row.user_id !== expectedUserId)) { db.exec('COMMIT'); return null; }
      if (!sameHash(row.code_hash, codeHash)) {
        db.prepare('UPDATE auth_challenges SET attempts_left = attempts_left - 1 WHERE challenge_hash = ?').run(challengeHash);
        db.exec('COMMIT');
        return null;
      }
      let result;
      if (purpose === 'registration') {
        if (findUserByEmail(row.email)) { db.exec('COMMIT'); return null; }
        result = createUser(row.email, row.password_hash, now, now);
      } else if (purpose === 'verify') {
        db.prepare('UPDATE users SET email_verified_at = ? WHERE id = ? AND email = ?').run(now, row.user_id, row.email);
        result = findUserById(row.user_id);
      } else {
        if (!nextPasswordHash) throw new Error('Missing password hash');
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ? AND email = ?').run(nextPasswordHash, row.user_id, row.email);
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.user_id);
        result = findUserById(row.user_id);
      }
      db.prepare('DELETE FROM auth_challenges WHERE challenge_hash = ?').run(challengeHash);
      db.exec('COMMIT');
      return result;
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }

  return {
    createUser, findUserByEmail, findUserById, saveSession, userForSession, deleteSession,
    getBirthProfile, saveBirthProfile, issueChallenge, deleteChallenge, consumeChallenge, consumeDailyQuota,
    close: () => db.close(),
  };
}

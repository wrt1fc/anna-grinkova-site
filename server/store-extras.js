// Plans, extra chart profiles, consented chat history and daily traffic counters.
// Kept apart from store.js so account basics and these newer features stay readable.
import { DEFAULT_PLAN } from './plans.js';

const BIRTH_COLUMNS = `birth_date AS birthDate, birth_time AS birthTime, birth_place AS birthPlace,
  city_id AS birthCityId, birth_latitude AS birthLatitude, birth_longitude AS birthLongitude,
  birth_time_zone AS birthTimeZone, birth_utc AS birthUtc, birth_utc_offset_minutes AS birthUtcOffsetMinutes`;

export function migrateExtras(db) {
  const userColumns = new Set(db.prepare('PRAGMA table_info(users)').all().map((row) => row.name));
  if (!userColumns.has('plan')) db.exec(`ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT '${DEFAULT_PLAN}'`);
  if (!userColumns.has('chat_history_consent_at')) db.exec('ALTER TABLE users ADD COLUMN chat_history_consent_at INTEGER');
  db.exec(`
    CREATE TABLE IF NOT EXISTS chart_profiles (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      relation TEXT NOT NULL, label TEXT NOT NULL,
      birth_date TEXT NOT NULL, birth_time TEXT NOT NULL, birth_place TEXT NOT NULL, city_id INTEGER,
      birth_latitude REAL, birth_longitude REAL, birth_time_zone TEXT, birth_utc TEXT, birth_utc_offset_minutes INTEGER,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS chart_profiles_user ON chart_profiles(user_id, id);
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      profile_id INTEGER REFERENCES chart_profiles(id) ON DELETE SET NULL,
      role TEXT NOT NULL CHECK(role IN ('user','assistant')), content TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS chat_messages_user ON chat_messages(user_id, id);
    CREATE TABLE IF NOT EXISTS metrics_daily (
      day TEXT NOT NULL, metric TEXT NOT NULL, value INTEGER NOT NULL, PRIMARY KEY(day, metric)
    );
    CREATE TABLE IF NOT EXISTS visitors_daily (
      day TEXT NOT NULL, visitor TEXT NOT NULL, PRIMARY KEY(day, visitor)
    );
  `);
}

export function createExtras(db) {
  const profileRow = (row) => row && { id: row.id, relation: row.relation, label: row.label, ...Object.fromEntries(
    Object.entries(row).filter(([key]) => key.startsWith('birth'))), updatedAt: row.updatedAt };

  // The effective plan honours the paid period: see planState in store-billing.js.
  function setPlan(userId, plan) { db.prepare('UPDATE users SET plan = ?, plan_expires_at = NULL WHERE id = ?').run(plan, userId); }
  function findUserIdByEmail(email) { return db.prepare('SELECT id FROM users WHERE email = ?').get(email)?.id ?? null; }

  function listChartProfiles(userId) {
    return db.prepare(`SELECT id, relation, label, ${BIRTH_COLUMNS}, updated_at AS updatedAt FROM chart_profiles
      WHERE user_id = ? ORDER BY id`).all(userId).map(profileRow);
  }
  function getChartProfile(userId, id) {
    return profileRow(db.prepare(`SELECT id, relation, label, ${BIRTH_COLUMNS}, updated_at AS updatedAt FROM chart_profiles
      WHERE user_id = ? AND id = ?`).get(userId, id)) ?? null;
  }
  function birthValues(profile) {
    return [profile.birthDate, profile.birthTime, profile.birthPlace, profile.birthCityId ?? null, profile.birthLatitude ?? null,
      profile.birthLongitude ?? null, profile.birthTimeZone ?? null, profile.birthUtc ?? null, profile.birthUtcOffsetMinutes ?? null];
  }
  // The limit is checked inside the transaction so two parallel requests cannot exceed the plan.
  function createChartProfile(userId, { relation, label, ...profile }, limit, now = Date.now()) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const count = db.prepare('SELECT COUNT(*) AS count FROM chart_profiles WHERE user_id = ?').get(userId).count;
      if (count >= limit) { db.exec('COMMIT'); return null; }
      const result = db.prepare(`INSERT INTO chart_profiles (user_id, relation, label, birth_date, birth_time, birth_place, city_id,
        birth_latitude, birth_longitude, birth_time_zone, birth_utc, birth_utc_offset_minutes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(userId, relation, label, ...birthValues(profile), now, now);
      db.exec('COMMIT');
      return getChartProfile(userId, Number(result.lastInsertRowid));
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function updateChartProfile(userId, id, { relation, label, ...profile }, now = Date.now()) {
    const result = db.prepare(`UPDATE chart_profiles SET relation = ?, label = ?, birth_date = ?, birth_time = ?, birth_place = ?,
      city_id = ?, birth_latitude = ?, birth_longitude = ?, birth_time_zone = ?, birth_utc = ?, birth_utc_offset_minutes = ?,
      updated_at = ? WHERE user_id = ? AND id = ?`).run(relation, label, ...birthValues(profile), now, userId, id);
    return result.changes ? getChartProfile(userId, id) : null;
  }
  // Questions about a removed person go with the profile; keeping them would keep their story.
  function deleteChartProfile(userId, id) {
    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM chat_messages WHERE user_id = ? AND profile_id = ?').run(userId, id);
      const removed = db.prepare('DELETE FROM chart_profiles WHERE user_id = ? AND id = ?').run(userId, id).changes === 1;
      db.exec('COMMIT');
      return removed;
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }

  function chatConsent(userId) {
    return db.prepare('SELECT chat_history_consent_at AS at FROM users WHERE id = ?').get(userId)?.at ?? null;
  }
  // Withdrawing consent erases the stored history at once.
  function setChatConsent(userId, consent, now = Date.now()) {
    db.prepare('UPDATE users SET chat_history_consent_at = ? WHERE id = ?').run(consent ? now : null, userId);
    if (!consent) deleteChatMessages(userId);
  }
  function appendChatMessages(userId, profileId, messages, now = Date.now(), retentionMs = 180 * 86_400_000, maxMessages = 500) {
    if (chatConsent(userId) == null) return false;
    const insert = db.prepare('INSERT INTO chat_messages (user_id, profile_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)');
    db.exec('BEGIN');
    try {
      messages.forEach((message, index) => insert.run(userId, profileId, message.role, message.content, now + index));
      db.prepare('DELETE FROM chat_messages WHERE user_id = ? AND created_at < ?').run(userId, now - retentionMs);
      db.prepare(`DELETE FROM chat_messages WHERE user_id = ? AND id NOT IN (
        SELECT id FROM chat_messages WHERE user_id = ? ORDER BY id DESC LIMIT ?)`).run(userId, userId, maxMessages);
      db.exec('COMMIT');
      return true;
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function listChatMessages(userId, limit = 50) {
    return db.prepare(`SELECT role, content, profile_id AS profileId, created_at AS createdAt FROM (
      SELECT * FROM chat_messages WHERE user_id = ? ORDER BY id DESC LIMIT ?) ORDER BY id`).all(userId, limit);
  }
  function deleteChatMessages(userId) { db.prepare('DELETE FROM chat_messages WHERE user_id = ?').run(userId); }

  function incrementMetric(day, metric, by = 1) {
    db.prepare(`INSERT INTO metrics_daily (day, metric, value) VALUES (?, ?, ?)
      ON CONFLICT(day, metric) DO UPDATE SET value = value + excluded.value`).run(day, metric, by);
  }
  // Returns true only the first time a visitor hash is seen that day.
  let visitorsCleanedFor = null;
  function markVisitor(day, visitor) {
    if (visitorsCleanedFor !== day) { db.prepare('DELETE FROM visitors_daily WHERE day < ?').run(day); visitorsCleanedFor = day; }
    return db.prepare('INSERT OR IGNORE INTO visitors_daily (day, visitor) VALUES (?, ?)').run(day, visitor).changes === 1;
  }
  function listMetrics(fromDay) {
    return db.prepare('SELECT day, metric, value FROM metrics_daily WHERE day >= ? ORDER BY day, metric').all(fromDay);
  }

  return { setPlan, findUserIdByEmail, listChartProfiles, getChartProfile, createChartProfile, updateChartProfile,
    deleteChartProfile, chatConsent, setChatConsent, appendChatMessages, listChatMessages, deleteChatMessages,
    incrementMetric, markVisitor, listMetrics };
}

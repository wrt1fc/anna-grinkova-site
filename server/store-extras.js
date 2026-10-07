// Plans, extra chart profiles, consented chat history and daily traffic counters.
// Kept apart from store.js so account basics and these newer features stay readable.

const BIRTH_COLUMNS = `birth_date AS "birthDate", birth_time AS "birthTime", birth_place AS "birthPlace",
  city_id AS "birthCityId", birth_latitude AS "birthLatitude", birth_longitude AS "birthLongitude",
  birth_time_zone AS "birthTimeZone", birth_utc AS "birthUtc", birth_utc_offset_minutes AS "birthUtcOffsetMinutes"`;
const CHAT_RETENTION_MS = 180 * 86_400_000;
const MAX_CHAT_MESSAGES = 500;

export function createExtras(q, transaction) {
  const profileRow = (row) => row && { id: row.id, relation: row.relation, label: row.label, ...Object.fromEntries(
    Object.entries(row).filter(([key]) => key.startsWith('birth'))), updatedAt: row.updatedAt };

  // The effective plan honours the paid period: see planState in store-billing.js.
  async function setPlan(userId, plan) { await q.run('UPDATE users SET plan = $1, plan_expires_at = NULL WHERE id = $2', [plan, userId]); }
  async function findUserIdByEmail(email) { return (await q.one('SELECT id FROM users WHERE email = $1', [email]))?.id ?? null; }

  async function listChartProfiles(userId) {
    return (await q.query(`SELECT id, relation, label, ${BIRTH_COLUMNS}, updated_at AS "updatedAt" FROM chart_profiles
      WHERE user_id = $1 ORDER BY id`, [userId])).map(profileRow);
  }
  async function getChartProfile(userId, id) {
    return profileRow(await q.one(`SELECT id, relation, label, ${BIRTH_COLUMNS}, updated_at AS "updatedAt" FROM chart_profiles
      WHERE user_id = $1 AND id = $2`, [userId, id])) ?? null;
  }
  function birthValues(profile) {
    return [profile.birthDate, profile.birthTime, profile.birthPlace, profile.birthCityId ?? null, profile.birthLatitude ?? null,
      profile.birthLongitude ?? null, profile.birthTimeZone ?? null, profile.birthUtc ?? null, profile.birthUtcOffsetMinutes ?? null];
  }
  // The account row is locked before counting, so two parallel requests cannot exceed the plan.
  async function createChartProfile(userId, { relation, label, ...profile }, limit, now = Date.now()) {
    return transaction(async (tx) => {
      await tx.lockUser(userId);
      const { count } = await tx.q.one('SELECT COUNT(*) AS count FROM chart_profiles WHERE user_id = $1', [userId]);
      if (count >= limit) return null;
      const row = await tx.q.one(`INSERT INTO chart_profiles (user_id, relation, label, birth_date, birth_time, birth_place, city_id,
        birth_latitude, birth_longitude, birth_time_zone, birth_utc, birth_utc_offset_minutes, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
      [userId, relation, label, ...birthValues(profile), now, now]);
      return tx.getChartProfile(userId, row.id);
    });
  }
  async function updateChartProfile(userId, id, { relation, label, ...profile }, now = Date.now()) {
    const changed = await q.run(`UPDATE chart_profiles SET relation = $1, label = $2, birth_date = $3, birth_time = $4, birth_place = $5,
      city_id = $6, birth_latitude = $7, birth_longitude = $8, birth_time_zone = $9, birth_utc = $10, birth_utc_offset_minutes = $11,
      updated_at = $12 WHERE user_id = $13 AND id = $14`, [relation, label, ...birthValues(profile), now, userId, id]);
    return changed ? getChartProfile(userId, id) : null;
  }
  // Questions about a removed person go with the profile; keeping them would keep their story.
  async function deleteChartProfile(userId, id) {
    return transaction(async (tx) => {
      await tx.q.run('DELETE FROM chat_messages WHERE user_id = $1 AND profile_id = $2', [userId, id]);
      return (await tx.q.run('DELETE FROM chart_profiles WHERE user_id = $1 AND id = $2', [userId, id])) === 1;
    });
  }

  async function chatConsent(userId) {
    return (await q.one('SELECT chat_history_consent_at AS at FROM users WHERE id = $1', [userId]))?.at ?? null;
  }
  // Withdrawing consent erases the stored history at once.
  async function setChatConsent(userId, consent, now = Date.now()) {
    await transaction(async (tx) => {
      await tx.q.run('UPDATE users SET chat_history_consent_at = $1 WHERE id = $2', [consent ? now : null, userId]);
      if (!consent) await tx.deleteChatMessages(userId);
    });
  }
  async function appendChatMessages(userId, profileId, messages, now = Date.now(), retentionMs = CHAT_RETENTION_MS, maxMessages = MAX_CHAT_MESSAGES) {
    if (await chatConsent(userId) == null) return false;
    await transaction(async (tx) => {
      for (const [index, message] of messages.entries()) {
        await tx.q.run('INSERT INTO chat_messages (user_id, profile_id, role, content, created_at) VALUES ($1, $2, $3, $4, $5)',
          [userId, profileId, message.role, message.content, now + index]);
      }
      await tx.q.run('DELETE FROM chat_messages WHERE user_id = $1 AND created_at < $2', [userId, now - retentionMs]);
      await tx.q.run(`DELETE FROM chat_messages WHERE user_id = $1 AND id NOT IN (
        SELECT id FROM chat_messages WHERE user_id = $1 ORDER BY id DESC LIMIT $2)`, [userId, maxMessages]);
    });
    return true;
  }
  async function listChatMessages(userId, limit = 50) {
    return q.query(`SELECT role, content, profile_id AS "profileId", created_at AS "createdAt" FROM (
      SELECT * FROM chat_messages WHERE user_id = $1 ORDER BY id DESC LIMIT $2) AS recent ORDER BY id`, [userId, limit]);
  }
  async function deleteChatMessages(userId) { await q.run('DELETE FROM chat_messages WHERE user_id = $1', [userId]); }

  async function incrementMetric(day, metric, by = 1) {
    await q.run(`INSERT INTO metrics_daily (day, metric, value) VALUES ($1, $2, $3)
      ON CONFLICT (day, metric) DO UPDATE SET value = metrics_daily.value + excluded.value`, [day, metric, by]);
  }
  // Returns true only the first time a visitor hash is seen that day; older days are dropped.
  let visitorsCleanedFor = null;
  async function markVisitor(day, visitor) {
    if (visitorsCleanedFor !== day) { await q.run('DELETE FROM visitors_daily WHERE day < $1', [day]); visitorsCleanedFor = day; }
    return (await q.run('INSERT INTO visitors_daily (day, visitor) VALUES ($1, $2) ON CONFLICT DO NOTHING', [day, visitor])) === 1;
  }
  async function listMetrics(fromDay) {
    return q.query('SELECT day, metric, value FROM metrics_daily WHERE day >= $1 ORDER BY day, metric', [fromDay]);
  }

  return { setPlan, findUserIdByEmail, listChartProfiles, getChartProfile, createChartProfile, updateChartProfile,
    deleteChartProfile, chatConsent, setChatConsent, appendChatMessages, listChatMessages, deleteChatMessages,
    incrementMetric, markVisitor, listMetrics };
}

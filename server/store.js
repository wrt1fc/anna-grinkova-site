import { timingSafeEqual } from 'node:crypto';
import { openDatabase } from './db.js';
import { migrate } from './schema.js';
import { createExtras } from './store-extras.js';
import { createBillingStore } from './store-billing.js';
import { DEFAULT_PLAN } from './plans.js';

const CODE_LIFETIME = 10 * 60 * 1000;
const SEND_COOLDOWN = 60 * 1000;

function sameHash(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left, 'hex'), b = Buffer.from(right, 'hex');
  return a.length === 32 && b.length === 32 && timingSafeEqual(a, b);
}

// Account basics. `q` runs queries (the pool or one transaction); `transaction(work)` runs work atomically
// and is a plain call when `q` is already inside a transaction.
function createAccounts(q, transaction) {
  async function createUser(email, passwordHash, now = Date.now(), verifiedAt = null) {
    const row = await q.one('INSERT INTO users (email, password_hash, created_at, email_verified_at) VALUES ($1, $2, $3, $4) RETURNING id',
      [email, passwordHash, now, verifiedAt]);
    return { id: row.id, email, emailVerified: verifiedAt !== null };
  }

  async function findUserByEmail(email) {
    return q.one('SELECT id, email, password_hash, email_verified_at FROM users WHERE email = $1', [email]);
  }

  async function findUserById(id) {
    return q.one('SELECT id, email, email_verified_at, display_name FROM users WHERE id = $1', [id]);
  }

  async function saveSession(hash, userId, expiresAt) {
    await q.run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [hash, userId, expiresAt]);
  }

  async function userForSession(hash, now = Date.now()) {
    const row = await q.one(`SELECT users.id, users.email, users.email_verified_at, users.display_name FROM sessions
      JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = $1 AND sessions.expires_at > $2`, [hash, now]);
    return row ? { id: row.id, email: row.email, emailVerified: row.email_verified_at !== null, displayName: row.display_name } : null;
  }

  async function saveDisplayName(userId, name) {
    await q.run('UPDATE users SET display_name = $1 WHERE id = $2', [name, userId]);
    return name;
  }

  async function deleteSession(hash) { await q.run('DELETE FROM sessions WHERE token_hash = $1', [hash]); }

  async function getBirthProfile(userId) {
    return q.one(`SELECT birth_date AS "birthDate", birth_time AS "birthTime", birth_place AS "birthPlace",
      city_id AS "birthCityId", birth_latitude AS "birthLatitude", birth_longitude AS "birthLongitude",
      birth_time_zone AS "birthTimeZone", birth_utc AS "birthUtc",
      birth_utc_offset_minutes AS "birthUtcOffsetMinutes", updated_at AS "updatedAt"
      FROM birth_profiles WHERE user_id = $1`, [userId]);
  }

  async function saveBirthProfile(userId, profile, now = Date.now()) {
    await q.run(`INSERT INTO birth_profiles (user_id, birth_date, birth_time, birth_place, city_id,
      birth_latitude, birth_longitude, birth_time_zone, birth_utc, birth_utc_offset_minutes, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) ON CONFLICT (user_id) DO UPDATE SET birth_date = excluded.birth_date,
      birth_time = excluded.birth_time, birth_place = excluded.birth_place, city_id = excluded.city_id,
      birth_latitude = excluded.birth_latitude, birth_longitude = excluded.birth_longitude,
      birth_time_zone = excluded.birth_time_zone, birth_utc = excluded.birth_utc,
      birth_utc_offset_minutes = excluded.birth_utc_offset_minutes, updated_at = excluded.updated_at`,
    [userId, profile.birthDate, profile.birthTime, profile.birthPlace, profile.birthCityId ?? null,
      profile.birthLatitude ?? null, profile.birthLongitude ?? null, profile.birthTimeZone ?? null,
      profile.birthUtc ?? null, profile.birthUtcOffsetMinutes ?? null, now]);
    return getBirthProfile(userId);
  }

  async function issueChallenge({ challengeHash, purpose, email, userId = null, passwordHash = null, codeHash }, now = Date.now()) {
    // The cooldown is checked in the upsert itself, so two parallel requests cannot both send a code.
    const written = await q.run(`INSERT INTO auth_challenges
      (challenge_hash, purpose, email, user_id, password_hash, code_hash, expires_at, attempts_left, last_sent_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 5, $8)
      ON CONFLICT (purpose, email) DO UPDATE SET challenge_hash = excluded.challenge_hash,
      user_id = excluded.user_id, password_hash = excluded.password_hash, code_hash = excluded.code_hash,
      expires_at = excluded.expires_at, attempts_left = 5, last_sent_at = excluded.last_sent_at
      WHERE auth_challenges.last_sent_at <= $9`,
    [challengeHash, purpose, email, userId, passwordHash, codeHash, now + CODE_LIFETIME, now, now - SEND_COOLDOWN]);
    return written === 1;
  }

  async function deleteChallenge(challengeHash) {
    await q.run('DELETE FROM auth_challenges WHERE challenge_hash = $1', [challengeHash]);
  }

  // Gives back a unit when the counted action did not happen (model error, visitor pressed Stop).
  async function refundDailyQuota(kind, day) {
    await q.run('UPDATE daily_quotas SET used = used - 1 WHERE kind = $1 AND day = $2 AND used > 0', [kind, day]);
  }

  async function consumeDailyQuota(kind, day, limit) {
    if (!Number.isSafeInteger(limit) || limit < 1) return false;
    return (await q.run(`INSERT INTO daily_quotas (kind, day, used) VALUES ($1, $2, 1)
      ON CONFLICT (kind, day) DO UPDATE SET used = daily_quotas.used + 1 WHERE daily_quotas.used < $3`, [kind, day, limit])) === 1;
  }

  // The challenge row is locked, so a code cannot be used twice by parallel requests.
  async function consumeChallenge(challengeHash, codeHash, purpose, now = Date.now(), nextPasswordHash = null, expectedUserId = null) {
    return transaction(async (tx) => {
      const row = await tx.q.one('SELECT * FROM auth_challenges WHERE challenge_hash = $1 AND purpose = $2 FOR UPDATE', [challengeHash, purpose]);
      if (!row || row.expires_at <= now || row.attempts_left <= 0
        || (purpose !== 'registration' && row.user_id === null)
        || (expectedUserId !== null && row.user_id !== expectedUserId)) return null;
      if (!sameHash(row.code_hash, codeHash)) {
        await tx.q.run('UPDATE auth_challenges SET attempts_left = attempts_left - 1 WHERE challenge_hash = $1', [challengeHash]);
        return null;
      }
      let result;
      if (purpose === 'registration') {
        if (await tx.findUserByEmail(row.email)) return null;
        result = await tx.createUser(row.email, row.password_hash, now, now);
      } else if (purpose === 'verify') {
        await tx.q.run('UPDATE users SET email_verified_at = $1 WHERE id = $2 AND email = $3', [now, row.user_id, row.email]);
        result = await tx.findUserById(row.user_id);
      } else {
        if (!nextPasswordHash) throw new Error('Missing password hash');
        await tx.q.run('UPDATE users SET password_hash = $1 WHERE id = $2 AND email = $3', [nextPasswordHash, row.user_id, row.email]);
        await tx.q.run('DELETE FROM sessions WHERE user_id = $1', [row.user_id]);
        result = await tx.findUserById(row.user_id);
      }
      await tx.q.run('DELETE FROM auth_challenges WHERE challenge_hash = $1', [challengeHash]);
      return result;
    });
  }

  // Serialises plan, profile and payment changes of one account inside a transaction.
  async function lockUser(userId) { await q.one('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]); }

  return { createUser, findUserByEmail, findUserById, saveSession, userForSession, deleteSession, saveDisplayName,
    getBirthProfile, saveBirthProfile, issueChallenge, deleteChallenge, consumeChallenge, consumeDailyQuota, refundDailyQuota, lockUser };
}

function storeApi(q, transaction) {
  const billing = createBillingStore(q, { defaultPlan: DEFAULT_PLAN });
  return {
    q,
    ...createAccounts(q, transaction),
    ...createExtras(q, transaction),
    ...billing,
    getPlan: async (userId, now) => (await billing.planState(userId, now)).plan,
    inTransaction: transaction,
  };
}

// DATABASE_URL: postgres://… in production, pglite:memory in tests, pglite:<folder> for local development.
export async function createStore(url) {
  const db = await openDatabase(url);
  await migrate(db);
  // Inside a transaction the API is rebuilt on that transaction's connection, and nested transactions simply join it.
  const onTransaction = (tx) => {
    const txApi = storeApi(tx, (work) => work(txApi));
    return txApi;
  };
  const api = storeApi(db, (work) => db.transaction((tx) => work(onTransaction(tx))));
  return {
    ...api,
    health: async () => (await db.one('SELECT 1 AS ok'))?.ok === 1,
    close: () => db.close(),
  };
}

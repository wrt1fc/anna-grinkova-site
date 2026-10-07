import { timingSafeEqual } from 'node:crypto';
import { openDatabase } from './db.js';
import { migrate } from './schema.js';
import { createExtras } from './store-extras.js';
import { createBillingStore } from './store-billing.js';
import { DEFAULT_PLAN } from './plans.js';

const CODE_LIFETIME = 10 * 60 * 1000;
const SEND_COOLDOWN = 60 * 1000;
const QUOTA_KEEP_MS = 7 * 86_400_000;
// Wrong codes per address per day, counted across re-issued codes, so guessing cannot restart every minute.
const MAX_CODE_FAILURES_PER_DAY = 10;
const CHAT_RETENTION_MS = 180 * 86_400_000;
const PAYMENT_EVENT_KEEP_MS = 365 * 86_400_000;

function sameHash(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left, 'hex'), b = Buffer.from(right, 'hex');
  return a.length === 32 && b.length === 32 && timingSafeEqual(a, b);
}

// Account basics. `q` runs queries (the pool or one transaction); `transaction(work)` runs work atomically
// and is a plain call when `q` is already inside a transaction.
function createAccounts(q, transaction) {
  async function createUser(email, passwordHash, now = Date.now(), verifiedAt = null, policyVersion = null) {
    const row = await q.one(`INSERT INTO users (email, password_hash, created_at, email_verified_at, privacy_consent_at, privacy_policy_version)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`, [email, passwordHash, now, verifiedAt, policyVersion ? now : null, policyVersion]);
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

  async function issueChallenge({ challengeHash, purpose, email, userId = null, passwordHash = null, codeHash, policyVersion = null }, now = Date.now()) {
    // The cooldown is checked in the upsert itself, so two parallel requests cannot both send a code.
    const written = await q.run(`INSERT INTO auth_challenges
      (challenge_hash, purpose, email, user_id, password_hash, code_hash, expires_at, attempts_left, last_sent_at, privacy_policy_version)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 5, $8, $10)
      ON CONFLICT (purpose, email) DO UPDATE SET challenge_hash = excluded.challenge_hash,
      privacy_policy_version = excluded.privacy_policy_version,
      user_id = excluded.user_id, password_hash = excluded.password_hash, code_hash = excluded.code_hash,
      expires_at = excluded.expires_at, attempts_left = 5, last_sent_at = excluded.last_sent_at
      WHERE auth_challenges.last_sent_at <= $9`,
    [challengeHash, purpose, email, userId, passwordHash, codeHash, now + CODE_LIFETIME, now, now - SEND_COOLDOWN, policyVersion]);
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
      const failureKind = `code-fail:${row.email}`;
      const today = new Date(now).toISOString().slice(0, 10);
      const failures = (await tx.q.one('SELECT used FROM daily_quotas WHERE kind = $1 AND day = $2', [failureKind, today]))?.used ?? 0;
      if (failures >= MAX_CODE_FAILURES_PER_DAY) return null;
      if (!sameHash(row.code_hash, codeHash)) {
        await tx.q.run('UPDATE auth_challenges SET attempts_left = attempts_left - 1 WHERE challenge_hash = $1', [challengeHash]);
        await tx.consumeDailyQuota(failureKind, today, MAX_CODE_FAILURES_PER_DAY);
        return null;
      }
      let result;
      if (purpose === 'registration') {
        if (await tx.findUserByEmail(row.email)) return null;
        result = await tx.createUser(row.email, row.password_hash, now, now, row.privacy_policy_version);
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

  // Withdrawal of consent / account removal (152-FZ). Personal data goes; paid orders stay for accounting and receipts,
  // so an account with orders is anonymised instead of deleted (orders.user_id is ON DELETE RESTRICT).
  async function deleteAccount(userId) {
    return transaction(async (tx) => {
      await tx.lockUser(userId);
      const user = await tx.q.one('SELECT email FROM users WHERE id = $1', [userId]);
      if (!user) return false;
      for (const table of ['chat_messages', 'chart_profiles', 'birth_profiles', 'sessions']) {
        await tx.q.run(`DELETE FROM ${table} WHERE user_id = $1`, [userId]);
      }
      await tx.q.run('DELETE FROM auth_challenges WHERE user_id = $1 OR email = $2', [userId, user.email]);
      const { count } = await tx.q.one('SELECT COUNT(*) AS count FROM orders WHERE user_id = $1', [userId]);
      if (count === 0) {
        await tx.q.run('DELETE FROM users WHERE id = $1', [userId]);
        return true;
      }
      await tx.q.run(`UPDATE users SET email = $2, password_hash = '!deleted', display_name = NULL, email_verified_at = NULL,
        chat_history_consent_at = NULL, privacy_consent_at = NULL, privacy_policy_version = NULL, autorenew_method_id = NULL,
        autorenew_provider = NULL, autorenew_currency = NULL, plan_expires_at = NULL WHERE id = $1`, [userId, `deleted-${userId}@deleted.invalid`]);
      return true;
    });
  }

  // Everything stored about the account, for the person's own copy (right of access).
  async function exportAccount(userId) {
    const user = await q.one(`SELECT email, display_name AS "displayName", created_at AS "createdAt", email_verified_at AS "emailVerifiedAt",
      plan, plan_expires_at AS "planExpiresAt", chat_history_consent_at AS "chatHistoryConsentAt",
      privacy_consent_at AS "privacyConsentAt", privacy_policy_version AS "privacyPolicyVersion" FROM users WHERE id = $1`, [userId]);
    if (!user) return null;
    const [birthProfile, closePeople, chatMessages, orders] = await Promise.all([getBirthProfile(userId),
      q.query(`SELECT relation, label, birth_date AS "birthDate", birth_time AS "birthTime", birth_place AS "birthPlace",
        created_at AS "createdAt" FROM chart_profiles WHERE user_id = $1 ORDER BY id`, [userId]),
      q.query(`SELECT role, content, profile_id AS "profileId", created_at AS "createdAt" FROM chat_messages WHERE user_id = $1 ORDER BY id`, [userId]),
      q.query(`SELECT id, product_id AS "productId", amount_kop AS "amountMinor", currency, status, created_at AS "createdAt", paid_at AS "paidAt"
        FROM orders WHERE user_id = $1 ORDER BY created_at`, [userId])]);
    return { exportedAt: new Date().toISOString(), user, birthProfile, closePeople, chatMessages, orders };
  }

  // Daily housekeeping: expired sessions and codes, old daily counters and processed payment notifications.
  async function pruneExpired(now = Date.now()) {
    const day = (ms) => new Date(ms).toISOString().slice(0, 10);
    return {
      sessions: await q.run('DELETE FROM sessions WHERE expires_at <= $1', [now]),
      challenges: await q.run('DELETE FROM auth_challenges WHERE expires_at <= $1', [now]),
      quotas: await q.run('DELETE FROM daily_quotas WHERE day < $1', [day(now - QUOTA_KEEP_MS)]),
      paymentEvents: await q.run('DELETE FROM payment_events WHERE received_at < $1', [now - PAYMENT_EVENT_KEEP_MS]),
      // Chat history older than 180 days goes even for accounts that stopped writing.
      chatMessages: await q.run('DELETE FROM chat_messages WHERE created_at < $1', [now - CHAT_RETENTION_MS]),
    };
  }

  // Serialises plan, profile and payment changes of one account inside a transaction.
  async function lockUser(userId) { await q.one('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]); }

  return { createUser, findUserByEmail, findUserById, saveSession, userForSession, deleteSession, saveDisplayName,
    getBirthProfile, saveBirthProfile, issueChallenge, deleteChallenge, consumeChallenge, consumeDailyQuota, refundDailyQuota, lockUser, pruneExpired, deleteAccount, exportAccount };
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

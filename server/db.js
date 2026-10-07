// One small interface over PostgreSQL: the real server through `pg` (DATABASE_URL=postgres://…),
// and PGlite — the same PostgreSQL compiled to WebAssembly — for local development and tests
// (DATABASE_URL=pglite:memory or pglite:<folder>). SQL is identical in both, with $1… placeholders.
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const BIGINT_OID = 20;
const NUMERIC_OID = 1700;

// Executor shared by the pool, a pooled transaction client and PGlite.
function executor(queryFn) {
  return {
    async query(sql, params = []) { return (await queryFn(sql, params)).rows; },
    async one(sql, params = []) { return (await queryFn(sql, params)).rows[0] ?? null; },
    // Number of rows written; INSERT … ON CONFLICT DO NOTHING gives 0 for a duplicate.
    async run(sql, params = []) { const result = await queryFn(sql, params); return result.rowCount ?? result.affectedRows ?? 0; },
  };
}

async function openPglite(location) {
  const { PGlite } = await import('@electric-sql/pglite');
  const options = { parsers: { [BIGINT_OID]: Number, [NUMERIC_OID]: Number } };
  const db = location === 'memory' ? await PGlite.create(options) : await (async () => {
    const dataDir = resolve(location);
    await mkdir(dataDir, { recursive: true });
    return PGlite.create(dataDir, options);
  })();
  const run = (sql, params) => db.query(sql, params);
  return {
    ...executor(run),
    async exec(sql) { await db.exec(sql); },
    // PGlite runs one connection; its transaction() serialises callers, which also gives row-lock semantics.
    async transaction(work) { return db.transaction((tx) => work(executor((sql, params) => tx.query(sql, params)))); },
    async close() { await db.close(); },
  };
}

async function openPostgres(url) {
  const { default: pg } = await import('pg');
  // Millisecond timestamps are BIGINT; they are safe JavaScript numbers, so read them as numbers, not strings.
  pg.types.setTypeParser(BIGINT_OID, Number);
  pg.types.setTypeParser(NUMERIC_OID, Number);
  const pool = new pg.Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
    idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000 });
  pool.on('error', (error) => console.error('PostgreSQL pool error:', error.message));
  const run = (sql, params) => pool.query(sql, params);
  return {
    ...executor(run),
    async exec(sql) { await pool.query(sql); },
    async transaction(work) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await work(executor((sql, params) => client.query(sql, params)));
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally { client.release(); }
    },
    async close() { await pool.end(); },
  };
}

export async function openDatabase(url) {
  if (typeof url !== 'string' || !url) throw new Error('DATABASE_URL is required');
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) return openPostgres(url);
  if (url.startsWith('pglite:')) return openPglite(url.slice('pglite:'.length));
  throw new Error('DATABASE_URL must be postgres://… or pglite:memory / pglite:<folder>');
}

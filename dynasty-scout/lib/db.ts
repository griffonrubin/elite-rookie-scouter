/**
 * db.ts — Dual-mode database adapter
 *
 * LOCAL DEV  (DATABASE_URL not set): uses better-sqlite3 against dynasty_scout.db
 * PRODUCTION (DATABASE_URL set):     uses postgres.js against Supabase PostgreSQL
 *
 * All exported functions are async so callers work the same in both modes.
 */

import path from 'path';

const USE_POSTGRES = !!process.env.DATABASE_URL;

// ─── PostgreSQL (Supabase / Vercel) ──────────────────────────────────────────
let pgSql: any;
if (USE_POSTGRES) {
    // Dynamic require to avoid bundling postgres in SQLite-only builds
    const postgres = require('postgres');
    pgSql = postgres(process.env.DATABASE_URL!, {
        ssl: process.env.DATABASE_URL!.includes('localhost') ? false : { rejectUnauthorized: false },
        max: 10,
        idle_timeout: 20,
        connect_timeout: 10,
    });
}

// ─── SQLite (local dev) ───────────────────────────────────────────────────────
let sqliteDb: any;
if (!USE_POSTGRES) {
    const Database = require('better-sqlite3');
    const dbPath = path.join(process.cwd(), 'dynasty_scout.db');
    sqliteDb = new Database(dbPath);
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('synchronous = NORMAL');   // safe with WAL, faster than FULL
    sqliteDb.pragma('cache_size = -65536');    // 64 MB page cache
    sqliteDb.pragma('temp_store = MEMORY');    // CTEs/sorts in RAM not disk
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * PostgreSQL's `$N` placeholders to SQLite's positional `?`.
 *
 * The parameters have to be rebuilt alongside the query, not passed through.
 * Postgres numbers its placeholders, so `$1` may appear twice and takes the
 * same value both times; SQLite counts them, so the same query needs that
 * value supplied twice. Rewriting only the text and forwarding the original
 * list silently breaks every query that reuses a parameter — and it broke one.
 *
 * The positional dropoff page names the season twice, once in the join and
 * once in the subquery, and passed it once. Against Postgres that is correct.
 * Against SQLite it threw "Too few parameter values were provided", the page
 * caught it, logged it, and rendered an empty chart. The whole feature was
 * blank for as long as it had existed locally and nothing said so, because a
 * caught error still answers with a two hundred.
 *
 * So the two travel together: each `$N` becomes a `?` and pushes
 * `params[N - 1]` in the order the placeholders appear.
 */
function toSqlite(q: string, params: any[]): { sql: string; values: any[] } {
    const values: any[] = [];
    const sql = q.replace(/\$(\d+)/g, (_m, n: string) => {
        values.push(params[Number(n) - 1]);
        return '?';
    }).replace(/\bILIKE\b/gi, 'LIKE');
    // A query with no placeholders is passed its parameters untouched, which
    // keeps the `?`-style callers that never went through Postgres working.
    return { sql, values: values.length > 0 ? values : params };
}

// The main sql export (postgres client) — used directly in the updated API routes
const sql: any = USE_POSTGRES
    ? pgSql
    : {
          // Fake sql.unsafe() that delegates to SQLite
          async unsafe(queryStr: string, params: any[] = []): Promise<any[]> {
              const { sql: q, values } = toSqlite(queryStr, params);
              return sqliteDb.prepare(q).all(...values) as any[];
          },
      };

export default sql;

// ─── Convenience helpers ──────────────────────────────────────────────────────

export async function query<T = any>(queryStr: string, params: any[] = []): Promise<T[]> {
    if (USE_POSTGRES) {
        const result = await pgSql.unsafe(queryStr, params);
        return result as unknown as T[];
    }
    const { sql: q, values } = toSqlite(queryStr, params);
    return sqliteDb.prepare(q).all(...values) as T[];
}

export async function queryOne<T = any>(queryStr: string, params: any[] = []): Promise<T | undefined> {
    const rows = await query<T>(queryStr, params);
    return rows[0];
}

// ─── getDb() shim ─────────────────────────────────────────────────────────────
// Allows routes that call db.prepare(sql).all() / .run() to work unchanged.
// All methods are async — callers must await them.

export function getDb() {
    return {
        prepare(queryStr: string) {
            return {
                async all(...params: any[]): Promise<any[]> {
                    return query(queryStr, params.flat());
                },
                async get(...params: any[]): Promise<any | undefined> {
                    return queryOne(queryStr, params.flat());
                },
                async run(...params: any[]): Promise<{ lastInsertRowid: number; changes: number }> {
                    if (USE_POSTGRES) {
                        const flat = params.flat();
                        // Convert ? → $N if the query still has ? (shouldn't, but safety net)
                        let idx = 0;
                        const pgQuery = queryStr.replace(/\?/g, () => `$${++idx}`);
                        const isInsert = /^\s*INSERT/i.test(pgQuery);
                        const hasReturning = /RETURNING/i.test(pgQuery);
                        const finalQuery = isInsert && !hasReturning
                            ? pgQuery.replace(/;?\s*$/, ' RETURNING id')
                            : pgQuery;
                        const rows = await pgSql.unsafe(finalQuery, flat) as any[];
                        return { lastInsertRowid: rows[0]?.id ?? 0, changes: (rows as any).count ?? rows.length };
                    } else {
                        const flat = params.flat();
                        const { sql: q, values } = toSqlite(queryStr, flat);
                        const result = sqliteDb.prepare(q).run(...values);
                        return { lastInsertRowid: result.lastInsertRowid, changes: result.changes };
                    }
                },
            };
        },
    };
}

// ─── checkpoint() ─────────────────────────────────────────────────────────────

/**
 * Fold the write-ahead log back into the database file.
 *
 * In WAL mode a write does not go into dynasty_scout.db. It goes into
 * dynasty_scout.db-wal beside it, and every reader on this machine sees it
 * from there — so a table can exist for you, answer queries, survive
 * restarts, and still be invisible to git, which ignores the sidecar. That
 * is not hypothetical: the historical spread table sat in the WAL through
 * two commits with a clean `git status`, present in every local query and
 * absent from every clone.
 *
 * SQLite folds the log in on its own when it passes a thousand pages or when
 * the last connection closes cleanly, and a script that ends by letting the
 * process exit does neither reliably. So any script that writes calls this
 * before it finishes, and the file on disk is then the whole truth.
 *
 * A no-op against Postgres, which has no such split.
 */
export function checkpoint(): void {
    if (USE_POSTGRES) return;
    sqliteDb.pragma('wal_checkpoint(TRUNCATE)');
}

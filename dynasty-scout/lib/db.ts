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
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Convert PostgreSQL $N params back to SQLite ? for local mode */
function toSqlite(q: string): string {
    return q.replace(/\$\d+/g, '?').replace(/\bILIKE\b/gi, 'LIKE');
}

// The main sql export (postgres client) — used directly in the updated API routes
const sql: any = USE_POSTGRES
    ? pgSql
    : {
          // Fake sql.unsafe() that delegates to SQLite
          async unsafe(queryStr: string, params: any[] = []): Promise<any[]> {
              return sqliteDb.prepare(toSqlite(queryStr)).all(...params) as any[];
          },
      };

export default sql;

// ─── Convenience helpers ──────────────────────────────────────────────────────

export async function query<T = any>(queryStr: string, params: any[] = []): Promise<T[]> {
    if (USE_POSTGRES) {
        const result = await pgSql.unsafe(queryStr, params);
        return result as unknown as T[];
    }
    return sqliteDb.prepare(toSqlite(queryStr)).all(...params) as T[];
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
                        const stmt = sqliteDb.prepare(toSqlite(queryStr));
                        const result = stmt.run(...flat);
                        return { lastInsertRowid: result.lastInsertRowid, changes: result.changes };
                    }
                },
            };
        },
    };
}

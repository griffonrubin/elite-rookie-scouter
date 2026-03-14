import postgres from 'postgres';

if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set.');
}

// Singleton postgres.js connection
const sql = postgres(process.env.DATABASE_URL, {
    ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
});

export default sql;

// Async query helpers — params use PostgreSQL $1, $2, ... placeholders
export async function query<T = any>(queryStr: string, params: any[] = []): Promise<T[]> {
    const result = await sql.unsafe(queryStr, params);
    return result as unknown as T[];
}

export async function queryOne<T = any>(queryStr: string, params: any[] = []): Promise<T | undefined> {
    const result = await sql.unsafe(queryStr, params);
    return (result as unknown as T[])[0];
}

// Helper: convert SQLite ? placeholders to PostgreSQL $1, $2, ...
function toPostgres(queryStr: string): string {
    let idx = 0;
    return queryStr.replace(/\?/g, () => `$${++idx}`);
}

// getDb() shim — lets existing API routes call db.prepare(sql).all() / .run()
// All methods are async so callers must await them.
export function getDb() {
    return {
        prepare(queryStr: string) {
            const pgQuery = toPostgres(queryStr);
            return {
                async all(...params: any[]): Promise<any[]> {
                    const flat = params.flat();
                    const result = await sql.unsafe(pgQuery, flat);
                    return result as unknown as any[];
                },
                async get(...params: any[]): Promise<any | undefined> {
                    const flat = params.flat();
                    const result = await sql.unsafe(pgQuery, flat);
                    return (result as unknown as any[])[0];
                },
                async run(...params: any[]): Promise<{ lastInsertRowid: number; changes: number }> {
                    const flat = params.flat();
                    const isInsert = /^\s*INSERT/i.test(pgQuery);
                    const hasReturning = /RETURNING/i.test(pgQuery);
                    const finalQuery = isInsert && !hasReturning
                        ? pgQuery.replace(/;?\s*$/, ' RETURNING id')
                        : pgQuery;
                    const result = await sql.unsafe(finalQuery, flat);
                    const rows = result as unknown as any[];
                    return {
                        lastInsertRowid: rows[0]?.id ?? 0,
                        changes: (result as any).count ?? rows.length,
                    };
                },
            };
        },
    };
}

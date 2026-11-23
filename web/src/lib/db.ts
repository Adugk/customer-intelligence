/* eslint-disable @typescript-eslint/no-explicit-any */
// Database access layer.
// - If DATABASE_URL is set, connects to that PostgreSQL server (the online database).
// - Otherwise uses an embedded PostgreSQL (PGlite) stored in web/.data/pglite for local development.
// Both run the same SQL, so switching to the online database only needs DATABASE_URL.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { MIGRATIONS } from "./schema";

export type Row = Record<string, any>;
export type QueryFn = (text: string, params?: unknown[]) => Promise<Row[]>;

type Db = {
  query: QueryFn;
  exec: (sql: string) => Promise<void>;
  transaction: <T>(fn: (q: QueryFn) => Promise<T>) => Promise<T>;
};

const DATE_OID = 1082; // return SQL `date` values as 'YYYY-MM-DD' strings (no timezone shifts)

async function createDb(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const pg = await import("pg");
    const { Pool, types } = pg.default ?? pg;
    types.setTypeParser(DATE_OID, (v: string) => v);
    const local = /localhost|127\.0\.0\.1/.test(url);
    const pool = new Pool({
      connectionString: url,
      max: 5,
      ssl: local ? undefined : { rejectUnauthorized: true },
    });
    const query: QueryFn = async (text, params = []) => (await pool.query(text, params as any[])).rows;
    return {
      query,
      exec: async (sql) => {
        await pool.query(sql);
      },
      transaction: async (fn) => {
        const client = await pool.connect();
        try {
          await client.query("begin");
          const result = await fn(async (t, p = []) => (await client.query(t, p as any[])).rows);
          await client.query("commit");
          return result;
        } catch (e) {
          await client.query("rollback");
          throw e;
        } finally {
          client.release();
        }
      },
    };
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  mkdirSync(dir, { recursive: true });
  const pg = await PGlite.create(dir, { parsers: { [DATE_OID]: (v: string) => v } });
  const query: QueryFn = async (text, params = []) => (await pg.query(text, params as any[])).rows as Row[];
  return {
    query,
    exec: async (sql) => {
      await pg.exec(sql);
    },
    transaction: (fn) => pg.transaction((tx) => fn(async (t, p = []) => (await tx.query(t, p as any[])).rows as Row[])),
  };
}

async function migrate(db: Db) {
  await db.exec(
    "create table if not exists schema_migrations (id text primary key, applied_at timestamptz not null default now())",
  );
  const done = new Set((await db.query("select id from schema_migrations")).map((r) => r.id as string));
  if (MIGRATIONS.every((m) => done.has(m.id))) return;
  // Several server instances can start at once when hosted; a lock makes sure only one migrates.
  await db.transaction(async (q) => {
    await q("select pg_advisory_xact_lock(727274001)");
    const applied = new Set((await q("select id from schema_migrations")).map((r) => r.id as string));
    for (const m of MIGRATIONS) {
      if (applied.has(m.id)) continue;
      for (const stmt of m.sql.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) {
        await q(stmt);
      }
      await q("insert into schema_migrations (id) values ($1)", [m.id]);
    }
  });
}

const g = globalThis as unknown as { __cpisDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  if (!g.__cpisDb) {
    g.__cpisDb = createDb().then(async (db) => {
      await migrate(db);
      return db;
    });
    g.__cpisDb.catch(() => {
      g.__cpisDb = undefined;
    });
  }
  return g.__cpisDb;
}

export async function q(text: string, params: unknown[] = []): Promise<Row[]> {
  return (await getDb()).query(text, params);
}

export async function one(text: string, params: unknown[] = []): Promise<Row | undefined> {
  return (await q(text, params))[0];
}

export async function tx<T>(fn: (q: QueryFn) => Promise<T>): Promise<T> {
  return (await getDb()).transaction(fn);
}

import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { D1Database, D1PreparedStatement, D1Result } from "../env";

// node:sqlite (Node 22.5+) has no types in @types/node 20, so describe the
// little we use.
type SqliteStatement = {
  all(...params: unknown[]): Record<string, unknown>[];
  get(...params: unknown[]): Record<string, unknown> | undefined;
  run(...params: unknown[]): unknown;
};
type SqliteDatabase = { exec(sql: string): void; prepare(sql: string): SqliteStatement };
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (path: string) => SqliteDatabase;
};

const MIGRATIONS = new URL("../../migrations/", import.meta.url);

// An in-memory database with the real migrations applied, behind the subset
// of the D1 API the Worker uses.
export function createTestD1(): D1Database {
  const db = new DatabaseSync(":memory:");
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    db.exec(readFileSync(new URL(file, MIGRATIONS), "utf8"));
  }

  class Statement implements D1PreparedStatement {
    constructor(
      readonly sql: string,
      readonly params: unknown[] = [],
    ) {}
    bind(...values: unknown[]) {
      return new Statement(this.sql, values);
    }
    async first<T>() {
      const row = db.prepare(this.sql).get(...this.params);
      return (row ? { ...row } : null) as T | null;
    }
    async all<T>() {
      return this.allSync<T>();
    }
    async run() {
      return this.runSync();
    }
    allSync<T>(): D1Result<T> {
      return { results: db.prepare(this.sql).all(...this.params).map((r) => ({ ...r }) as T), success: true };
    }
    runSync(): D1Result {
      db.prepare(this.sql).run(...this.params);
      return { results: [], success: true };
    }
  }

  return {
    prepare: (sql) => new Statement(sql),
    async batch(statements) {
      db.exec("BEGIN");
      try {
        const results = statements.map((s) => (s as Statement).runSync());
        db.exec("COMMIT");
        return results;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

/** Minimal versioned migration runner (applies *.sql in filename order). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RootDb } from './connection';

const MIGRATIONS_DIR = path.dirname(fileURLToPath(import.meta.url)) + '/migrations';

export async function runMigrations(db: RootDb): Promise<string[]> {
  await db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )`,
  );
  const rows = await db.all<{ version: string }>('SELECT version FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.version));
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const newlyApplied: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const at = new Date().toISOString();
    // Postgres DDL is transactional: file + version mark commit atomically.
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.run('INSERT INTO schema_migrations (version, applied_at) VALUES ($1, $2)', [
        file,
        at,
      ]);
    });
    newlyApplied.push(file);
  }
  return newlyApplied;
}

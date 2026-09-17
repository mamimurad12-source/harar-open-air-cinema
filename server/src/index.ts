/** Production/dev server entry: API (+ built frontend when `dist/` exists). */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app';
import { config } from './config';
import { seedDatabase } from './seed';

async function main(): Promise<void> {
  const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
  const { app, db } = await createApp({ serveFrontend: distDir });

  // Seed BEFORE listening: migrations (inside createApp) → seed → traffic.
  // Idempotent and race-safe: existing rows are never touched, so this is
  // safe on every boot, restart, and free-tier wake. A fresh database (e.g.
  // a new Render deploy) therefore always has its premiere event + admin
  // user without any Shell access. No bookings/payments are ever seeded.
  await seedDatabase(db);

  const server = app.listen(config.port, () => {
    console.log(`[server] Harar Cinema API listening on http://localhost:${config.port} (${config.nodeEnv})`);
  });

  // Graceful shutdown: stop accepting, drain in-flight requests, then
  // release pool clients. Render sends SIGTERM before stopping the service.
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[server] ${signal} received — draining.`);
    server.close(() => {
      void db.close().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[server] Failed to start:', err);
  process.exit(1);
});

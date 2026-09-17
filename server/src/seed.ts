/**
 * Development seed: the real Harar Open Air Cinema event (facts from the
 * official poster) + one admin user. Idempotent — safe to run repeatedly.
 * Customer bookings are NEVER seeded; the box office starts at zero.
 *
 *   npm run db:seed
 */
import { config } from './config';
import { openDatabase } from './db/connection';
import { runMigrations } from './db/migrate';
import type { EventRow } from './db/types';
import { hashPassword } from './lib/auth';
import { newId } from './lib/ids';

const EVENT_ID = 'harar-open-air-cinema-001';

async function main() {
  const db = openDatabase(config.databasePath);
  const applied = runMigrations(db);
  if (applied.length > 0) console.log(`[seed] Applied migrations: ${applied.join(', ')}`);

  const existing = db.prepare('SELECT id FROM events WHERE id = ?').get(EVENT_ID) as
    | { id: string }
    | undefined;
  if (!existing) {
    const at = new Date().toISOString();
    const event: EventRow = {
      id: EVENT_ID,
      title: 'Harar Open Air Cinema',
      movie_title: null, // TBA — the poster leaves MOVIE blank; never invent a title.
      movie_poster: null,
      movie_trailer: null,
      movie_synopsis: null,
      event_date: '9-1-2019 EC',
      start_time: '11:00 LT',
      venue_name: 'Arthur Rimbaud Museum',
      venue_location: 'Harar, Ethiopia',
      ticket_price: 250,
      capacity: 100,
      reserved_seats: 0,
      free_snack: 1,
      status: 'PUBLISHED',
      created_at: at,
      updated_at: at,
    };
    db.prepare(
      `INSERT INTO events (id, title, movie_title, movie_poster, movie_trailer, movie_synopsis,
        event_date, start_time, venue_name, venue_location, ticket_price, capacity,
        reserved_seats, free_snack, status, created_at, updated_at)
       VALUES (@id, @title, @movie_title, @movie_poster, @movie_trailer, @movie_synopsis,
        @event_date, @start_time, @venue_name, @venue_location, @ticket_price, @capacity,
        @reserved_seats, @free_snack, @status, @created_at, @updated_at)`,
    ).run(event);
    console.log('[seed] Created event: Harar Open Air Cinema (9-1-2019 EC, 11:00 LT, 250 ETB, cap 100)');
  } else {
    console.log('[seed] Event already exists — leaving it untouched.');
  }

  const email = config.seedAdminEmail.trim().toLowerCase();
  const adminExists = db.prepare('SELECT id FROM admin_users WHERE email = ?').get(email) as
    | { id: string }
    | undefined;
  if (!adminExists) {
    db.prepare('INSERT INTO admin_users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      newId(),
      config.seedAdminName,
      email,
      await hashPassword(config.seedAdminPassword),
      'ADMIN',
      new Date().toISOString(),
    );
    console.log(`[seed] Created admin user: ${email}`);
    if (!process.env.ADMIN_PASSWORD) {
      console.log('[seed] Using default DEV password "change-me-dev-admin" — set ADMIN_PASSWORD in .env.');
    }
  } else {
    console.log(`[seed] Admin ${email} already exists — leaving it untouched.`);
  }

  db.close();
  console.log('[seed] Done.');
}

main().catch((err) => {
  console.error('[seed] Failed:', err);
  process.exit(1);
});

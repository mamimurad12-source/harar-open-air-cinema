/** Organizer use-cases: credentials, event management, booking read models. */
import type { Db } from '../db/connection';
import type { AdminUserRow, BookingRow, EventRow, TicketRow } from '../db/types';
import { badRequest, notFound } from '../lib/errors';
import { newId } from '../lib/ids';
import { verifyPassword } from '../lib/auth';
import type { BookingDto, EventDto } from './dto';
import { toBookingDto, toEventDto } from './dto';

export interface SafeAdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

/** Constant-shape failure: same work whether or not the email exists. */
export async function verifyAdminCredentials(
  db: Db,
  email: string,
  password: string,
): Promise<SafeAdminUser | null> {
  const user = db.prepare('SELECT * FROM admin_users WHERE email = ?').get(email.trim().toLowerCase()) as
    | AdminUserRow
    | undefined;
  // Dummy hash keeps timing indistinguishable for unknown emails.
  const dummyHash = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
  const ok = await verifyPassword(password, user?.password_hash ?? dummyHash);
  if (!user || !ok) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export function listEvents(db: Db): EventDto[] {
  const rows = db.prepare('SELECT * FROM events ORDER BY created_at DESC').all() as EventRow[];
  return rows.map(toEventDto);
}

export function getEventAdmin(db: Db, id: string): EventDto {
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(id) as EventRow | undefined;
  if (!row) throw notFound('EVENT_NOT_FOUND', 'Event not found.');
  return toEventDto(row);
}

export interface EventInput {
  title?: string;
  movieTitle?: string | null;
  moviePoster?: string | null;
  movieTrailer?: string | null;
  movieSynopsis?: string | null;
  date?: string;
  startTime?: string;
  venueName?: string;
  venueLocation?: string;
  ticketPrice?: number;
  capacity?: number;
  freeSnack?: boolean;
  status?: 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'COMPLETED';
}

function cleanText(value: unknown, field: string, opts?: { nullable?: boolean; max?: number }): string | null {
  if (value === undefined || value === null) {
    if (opts?.nullable) return null;
    throw badRequest('VALIDATION_ERROR', `${field} is required.`);
  }
  const text = String(value).trim();
  if (!text) {
    if (opts?.nullable) return null;
    throw badRequest('VALIDATION_ERROR', `${field} is required.`);
  }
  if (opts?.max && text.length > opts.max) {
    throw badRequest('VALIDATION_ERROR', `${field} is too long.`);
  }
  return text;
}

function cleanMoney(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw badRequest('VALIDATION_ERROR', 'Ticket price must be a whole non-negative number.');
  }
  return value as number;
}

function cleanCapacity(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw badRequest('VALIDATION_ERROR', 'Capacity must be at least 1.');
  }
  return value as number;
}

export function createEvent(db: Db, input: EventInput): EventDto {
  const at = new Date().toISOString();
  const id = newId();
  const row: EventRow = {
    id,
    title: cleanText(input.title, 'Title', { max: 120 }) as string,
    movie_title: input.movieTitle === undefined ? null : cleanText(input.movieTitle, 'Movie title', { nullable: true, max: 160 }),
    movie_poster: input.moviePoster === undefined ? null : cleanText(input.moviePoster, 'Poster URL', { nullable: true, max: 500 }),
    movie_trailer: input.movieTrailer === undefined ? null : cleanText(input.movieTrailer, 'Trailer URL', { nullable: true, max: 500 }),
    movie_synopsis: input.movieSynopsis === undefined ? null : cleanText(input.movieSynopsis, 'Synopsis', { nullable: true, max: 4000 }),
    event_date: cleanText(input.date, 'Date', { max: 40 }) as string,
    start_time: cleanText(input.startTime, 'Start time', { max: 40 }) as string,
    venue_name: cleanText(input.venueName, 'Venue name', { max: 160 }) as string,
    venue_location: cleanText(input.venueLocation, 'Venue location', { max: 160 }) as string,
    ticket_price: cleanMoney(input.ticketPrice),
    capacity: cleanCapacity(input.capacity),
    reserved_seats: 0,
    free_snack: input.freeSnack === false ? 0 : 1,
    status: input.status ?? 'DRAFT',
    created_at: at,
    updated_at: at,
  };
  if (!['DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED'].includes(row.status)) {
    throw badRequest('VALIDATION_ERROR', 'Invalid status.');
  }
  db.prepare(
    `INSERT INTO events (id, title, movie_title, movie_poster, movie_trailer, movie_synopsis,
      event_date, start_time, venue_name, venue_location, ticket_price, capacity,
      reserved_seats, free_snack, status, created_at, updated_at)
     VALUES (@id, @title, @movie_title, @movie_poster, @movie_trailer, @movie_synopsis,
      @event_date, @start_time, @venue_name, @venue_location, @ticket_price, @capacity,
      @reserved_seats, @free_snack, @status, @created_at, @updated_at)`,
  ).run(row);
  return toEventDto(row);
}

export function updateEvent(db: Db, id: string, patch: EventInput): EventDto {
  const current = db.prepare('SELECT * FROM events WHERE id = ?').get(id) as EventRow | undefined;
  if (!current) throw notFound('EVENT_NOT_FOUND', 'Event not found.');

  const next: EventRow = { ...current };
  if (patch.title !== undefined) next.title = cleanText(patch.title, 'Title', { max: 120 }) as string;
  if (patch.movieTitle !== undefined) next.movie_title = cleanText(patch.movieTitle, 'Movie title', { nullable: true, max: 160 });
  if (patch.moviePoster !== undefined) next.movie_poster = cleanText(patch.moviePoster, 'Poster URL', { nullable: true, max: 500 });
  if (patch.movieTrailer !== undefined) next.movie_trailer = cleanText(patch.movieTrailer, 'Trailer URL', { nullable: true, max: 500 });
  if (patch.movieSynopsis !== undefined) next.movie_synopsis = cleanText(patch.movieSynopsis, 'Synopsis', { nullable: true, max: 4000 });
  if (patch.date !== undefined) next.event_date = cleanText(patch.date, 'Date', { max: 40 }) as string;
  if (patch.startTime !== undefined) next.start_time = cleanText(patch.startTime, 'Start time', { max: 40 }) as string;
  if (patch.venueName !== undefined) next.venue_name = cleanText(patch.venueName, 'Venue name', { max: 160 }) as string;
  if (patch.venueLocation !== undefined) next.venue_location = cleanText(patch.venueLocation, 'Venue location', { max: 160 }) as string;
  if (patch.ticketPrice !== undefined) next.ticket_price = cleanMoney(patch.ticketPrice);
  if (patch.capacity !== undefined) {
    const capacity = cleanCapacity(patch.capacity);
    if (capacity < current.reserved_seats) {
      throw badRequest(
        'VALIDATION_ERROR',
        `Capacity cannot go below ${current.reserved_seats} — that many seats are already reserved.`,
      );
    }
    next.capacity = capacity;
  }
  if (patch.freeSnack !== undefined) next.free_snack = patch.freeSnack ? 1 : 0;
  if (patch.status !== undefined) {
    if (!['DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED'].includes(patch.status)) {
      throw badRequest('VALIDATION_ERROR', 'Invalid status.');
    }
    next.status = patch.status;
  }
  next.updated_at = new Date().toISOString();

  db.prepare(
    `UPDATE events SET title = @title, movie_title = @movie_title, movie_poster = @movie_poster,
      movie_trailer = @movie_trailer, movie_synopsis = @movie_synopsis, event_date = @event_date,
      start_time = @start_time, venue_name = @venue_name, venue_location = @venue_location,
      ticket_price = @ticket_price, capacity = @capacity, free_snack = @free_snack,
      status = @status, updated_at = @updated_at WHERE id = @id`,
  ).run(next);
  return toEventDto(next);
}

export interface BookingListItem {
  id: string;
  bookingReference: string;
  eventId: string;
  eventTitle: string;
  customerName: string;
  customerPhone: string;
  quantity: number;
  totalAmount: number;
  status: string;
  paymentStatus: string;
  createdAt: string;
}

export function listBookings(
  db: Db,
  options: { eventId?: string; limit: number; offset: number },
): { bookings: BookingListItem[]; total: number } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (options.eventId) {
    clauses.push('b.event_id = ?');
    params.push(options.eventId);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS count FROM bookings b ${where}`)
    .get(...params) as { count: number };
  const rows = db
    .prepare(
      `SELECT b.*, e.title AS event_title FROM bookings b
       JOIN events e ON e.id = b.event_id
       ${where} ORDER BY b.created_at DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, options.limit, options.offset) as Array<BookingRow & { event_title: string }>;
  return {
    total: totalRow.count,
    bookings: rows.map((r) => ({
      id: r.id,
      bookingReference: r.booking_reference,
      eventId: r.event_id,
      eventTitle: r.event_title,
      customerName: r.customer_name,
      customerPhone: r.customer_phone,
      quantity: r.quantity,
      totalAmount: r.total_amount,
      status: r.status,
      paymentStatus: r.payment_status,
      createdAt: r.created_at,
    })),
  };
}

export function getBookingDetail(db: Db, reference: string): BookingDto {
  const ref = reference.trim().toUpperCase();
  const booking = db
    .prepare('SELECT * FROM bookings WHERE booking_reference = ?')
    .get(ref) as BookingRow | undefined;
  if (!booking) throw notFound('BOOKING_NOT_FOUND', 'Booking not found.');
  const tickets = db
    .prepare('SELECT * FROM tickets WHERE booking_id = ? ORDER BY created_at ASC')
    .all(booking.id) as TicketRow[];
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(booking.event_id) as EventRow;
  return toBookingDto(booking, tickets, event);
}

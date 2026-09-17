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
  const user = await db.get<AdminUserRow>('SELECT * FROM admin_users WHERE email = $1', [
    email.trim().toLowerCase(),
  ]);
  // Dummy hash keeps timing indistinguishable for unknown emails.
  const dummyHash = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
  const ok = await verifyPassword(password, user?.password_hash ?? dummyHash);
  if (!user || !ok) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export async function listEvents(db: Db): Promise<EventDto[]> {
  const rows = await db.all<EventRow>('SELECT * FROM events ORDER BY created_at DESC');
  return rows.map(toEventDto);
}

export async function getEventAdmin(db: Db, id: string): Promise<EventDto> {
  const row = await db.get<EventRow>('SELECT * FROM events WHERE id = $1', [id]);
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
  venueName?: string | null;
  venueLocation?: string | null;
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

export async function createEvent(db: Db, input: EventInput): Promise<EventDto> {
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
  await db.run(
    `INSERT INTO events (id, title, movie_title, movie_poster, movie_trailer, movie_synopsis,
      event_date, start_time, venue_name, venue_location, ticket_price, capacity,
      reserved_seats, free_snack, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
    [
      row.id,
      row.title,
      row.movie_title,
      row.movie_poster,
      row.movie_trailer,
      row.movie_synopsis,
      row.event_date,
      row.start_time,
      row.venue_name,
      row.venue_location,
      row.ticket_price,
      row.capacity,
      row.reserved_seats,
      row.free_snack,
      row.status,
      row.created_at,
      row.updated_at,
    ],
  );
  return toEventDto(row);
}

export async function updateEvent(db: Db, id: string, patch: EventInput): Promise<EventDto> {
  const current = await db.get<EventRow>('SELECT * FROM events WHERE id = $1', [id]);
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

  await db.run(
    `UPDATE events SET title = $1, movie_title = $2, movie_poster = $3,
      movie_trailer = $4, movie_synopsis = $5, event_date = $6,
      start_time = $7, venue_name = $8, venue_location = $9,
      ticket_price = $10, capacity = $11, free_snack = $12,
      status = $13, updated_at = $14 WHERE id = $15`,
    [
      next.title,
      next.movie_title,
      next.movie_poster,
      next.movie_trailer,
      next.movie_synopsis,
      next.event_date,
      next.start_time,
      next.venue_name,
      next.venue_location,
      next.ticket_price,
      next.capacity,
      next.free_snack,
      next.status,
      next.updated_at,
      id,
    ],
  );
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

export async function listBookings(
  db: Db,
  options: { eventId?: string; limit: number; offset: number },
): Promise<{ bookings: BookingListItem[]; total: number }> {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (options.eventId) {
    clauses.push(`b.event_id = $${params.length + 1}`);
    params.push(options.eventId);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  // COUNT(*)::int — node-postgres returns bare COUNT(*) (bigint) as a string;
  // the API contract is a JSON number, so cast at the source.
  const totalRow = (await db.get<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM bookings b ${where}`,
    params,
  )) as { count: number };
  params.push(options.limit, options.offset);
  const rows = await db.all<BookingRow & { event_title: string }>(
    `SELECT b.*, e.title AS event_title FROM bookings b
     JOIN events e ON e.id = b.event_id
     ${where} ORDER BY b.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
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

export async function getBookingDetail(db: Db, reference: string): Promise<BookingDto> {
  const ref = reference.trim().toUpperCase();
  const booking = await db.get<BookingRow>('SELECT * FROM bookings WHERE booking_reference = $1', [
    ref,
  ]);
  if (!booking) throw notFound('BOOKING_NOT_FOUND', 'Booking not found.');
  const tickets = await db.all<TicketRow>(
    'SELECT * FROM tickets WHERE booking_id = $1 ORDER BY created_at ASC',
    [booking.id],
  );
  const event = (await db.get<EventRow>('SELECT * FROM events WHERE id = $1', [
    booking.event_id,
  ])) as EventRow;
  return toBookingDto(booking, tickets, event);
}

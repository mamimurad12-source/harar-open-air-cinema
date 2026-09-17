/**
 * API LAYER — the ONLY place that talks to data.
 * ------------------------------------------------------------------
 * `EventsApi` is the contract. Two implementations exist:
 *
 * - `HttpEventsApi` (DEFAULT): talks to the real Express + SQLite backend
 *   at `VITE_API_BASE` (default: same-origin `/api`). Used in production
 *   and whenever the API server is running.
 * - `MockEventsApi`: in-memory + localStorage fallback for pure-frontend
 *   development. Enable with `VITE_USE_MOCK_API=true`.
 *
 * Backend truth (server/):
 *   GET    /api/events /api/events/:id        (published only)
 *   POST   /api/bookings  (+ Idempotency-Key)  → PENDING/UNPAID booking
 *   GET    /api/bookings/:ref?phone=...        → booking + tickets
 *   GET    /api/payments/methods               → method availability
 *   POST   /api/bookings/:ref/payment          → initiate (server-priced)
 *   GET    /api/bookings/:ref/payment?phone=   → status view
 *   POST   /api/bookings/:ref/payment/verify   → server-side re-verify
 *   GET    /api/payments/callback/:provider    → redirect only (never pays)
 *   POST   /api/payments/webhook/:provider     → signed, idempotent
 *   POST   /api/admin/login|logout  GET /api/admin/me
 *   GET|POST /api/admin/events  PATCH /api/admin/events/:id
 *   GET    /api/admin/bookings  GET /api/admin/bookings/:ref
 *   GET    /api/admin/payments                 → payment ledger
 *   POST   /api/admin/tickets/validate         → explicit outcome
 *
 * Payment honesty: the frontend NEVER declares a payment paid. Completion
 * happens server-side only, after the provider confirms + the backend
 * re-verifies. Redirects and callbacks are hints, not proof.
 */

import type { EventDetails, EventStatus } from '../data/event';
import { HARAR_EVENT_SEED } from '../data/event';
import { qrPayloadForToken } from './tickets';

/* ------------------------------------------------------------------ */
/* Shared frontend domain types                                        */
/* ------------------------------------------------------------------ */

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
export type BookingStatus = 'pending_payment' | 'confirmed' | 'cancelled';

export interface TicketSummary {
  ticketNumber: string;
  qrToken?: string;
  status: string;
  validatedAt: string | null;
}

export interface BookingRecord {
  id: string;
  eventId: string;
  customerName: string;
  phone: string;
  quantity: number;
  totalETB: number;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  /** Chosen method (raw code) — set once payment starts. */
  paymentMethodRaw?: string | null;
  /** ISO deadline for completing payment (null when not applicable). */
  expiresAt?: string | null;
  ticketNumber: string;
  /** Payload that will be encoded in the real QR code. */
  qrPayload: string;
  createdAt: string;
  /** Raw backend enums (PENDING/CONFIRMED/… + UNPAID/PAID/…) for admin display. */
  statusRaw?: string;
  paymentStatusRaw?: string;
  eventTitle?: string;
  tickets?: TicketSummary[];
  /** True for seeded demo rows (mock mode only). */
  sample?: boolean;
}

export interface CreateBookingInput {
  eventId: string;
  customerName: string;
  phone: string;
  quantity: number;
  /** Client-generated key; safe retries reuse it so a double submit books once. */
  idempotencyKey?: string;
}

export interface NewEventInput {
  title: string;
  dateLabel: string;
  timeLabel: string;
  venue: string;
  city: string;
  country: string;
  priceETB: number;
  capacityTotal: number;
  snackIncluded?: boolean;
  status?: EventStatus;
}

export interface CapacitySnapshot {
  total: number;
  sold: number;
  remaining: number;
  isSoldOut: boolean;
}

export type TicketOutcome = 'VALID' | 'ALREADY_USED' | 'INVALID' | 'CANCELLED';

export interface TicketValidation {
  outcome: TicketOutcome;
  message: string;
  ticketNumber: string | null;
  customerName: string | null;
  quantity: number | null;
  bookingReference: string | null;
  paymentStatus: string | null;
  paymentPending: boolean;
  validatedAt: string | null;
  eventTitle: string | null;
}

export type PaymentMethodCode = 'EBIRR' | 'COOPAY' | 'CBE' | 'TELEBIRR' | 'MOBILE_BANKING';

export interface PaymentMethodInfo {
  method: PaymentMethodCode;
  label: string;
  provider: string | null;
  available: boolean;
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodCode, string> = {
  EBIRR: 'eBirr',
  COOPAY: 'Coopay',
  CBE: 'CBE',
  TELEBIRR: 'telebirr',
  MOBILE_BANKING: 'Mobile banking',
};

export interface PaymentAttempt {
  id: string;
  bookingReference: string;
  paymentMethod: string;
  provider: string;
  providerTransactionId: string | null;
  providerReference: string | null;
  providerMethod: string | null;
  amount: number;
  currency: string;
  status: string;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  verifiedAt: string | null;
}

export interface PaymentStatusView {
  booking: BookingRecord;
  payment: PaymentAttempt | null;
}

export interface InitiatePaymentResult {
  payment: PaymentAttempt;
  checkoutUrl: string | null;
  expiresAt: string | null;
}

export interface VerifyPaymentResult extends PaymentStatusView {
  verification: string;
}

export interface PaymentLedgerItem extends PaymentAttempt {
  customerName: string;
  customerPhone: string;
  eventTitle: string;
}

export class CapacityError extends Error {
  readonly remaining: number;
  constructor(remaining: number) {
    super(
      remaining <= 0
        ? 'This event is sold out.'
        : `Only ${remaining} seats are still available.`,
    );
    this.name = 'CapacityError';
    this.remaining = remaining;
  }
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface EventsApi {
  /** Published event detail (public). */
  getEvent(eventId: string): Promise<EventDetails>;
  getCapacity(eventId: string): Promise<CapacitySnapshot>;
  /** Reserves seats and creates a PENDING booking. Never marks payment paid. */
  createBooking(input: CreateBookingInput): Promise<BookingRecord>;
  /** Booking detail by reference (admin session required). */
  getBooking(reference: string): Promise<BookingRecord | null>;
  listBookings(eventId?: string): Promise<BookingRecord[]>;
  validateTicket(token: string): Promise<TicketValidation>;
  /** Customer payment methods with live availability (coming soon when unconfigured). */
  listPaymentMethods(): Promise<PaymentMethodInfo[]>;
  /** Start a payment attempt; returns safe checkout info (never secrets). */
  initiatePayment(reference: string, method: PaymentMethodCode): Promise<InitiatePaymentResult>;
  /** Read-only payment status (phone must match). Polling never pays. */
  getPaymentStatus(reference: string, phone: string): Promise<PaymentStatusView>;
  /** Ask the server to re-verify with the provider (return-from-payment path). */
  verifyPaymentNow(reference: string, phone: string): Promise<VerifyPaymentResult>;
  /** Public booking lookup (reference + matching phone). */
  getPublicBooking(reference: string, phone: string): Promise<BookingRecord | null>;
  /** Organizer payment ledger (admin session required). */
  listPayments(): Promise<PaymentLedgerItem[]>;
  /** All events incl. drafts (admin session required). */
  listEvents(): Promise<EventDetails[]>;
  createEvent(input: NewEventInput): Promise<EventDetails>;
  updateEvent(event: EventDetails): Promise<EventDetails>;
}

/* ------------------------------------------------------------------ */
/* Backend DTOs + mappers (HTTP layer only)                            */
/* ------------------------------------------------------------------ */

interface ApiEventDto {
  id: string;
  title: string;
  movieTitle: string | null;
  moviePoster: string | null;
  movieTrailer: string | null;
  movieSynopsis: string | null;
  date: string;
  startTime: string;
  venueName: string;
  venueLocation: string;
  ticketPrice: number;
  capacity: number;
  freeSnack: boolean;
  status: string;
  soldSeats: number;
  availableSeats: number;
  isSoldOut: boolean;
}

interface ApiTicketDto {
  ticketNumber: string;
  qrToken: string;
  status: string;
  validatedAt: string | null;
}

interface ApiBookingDto {
  bookingReference: string;
  eventId: string;
  customerName: string;
  customerPhone: string;
  quantity: number;
  totalAmount: number;
  status: string;
  paymentStatus: string;
  paymentMethod: string | null;
  expiresAt: string | null;
  createdAt: string;
  tickets: ApiTicketDto[];
}

interface ApiBookingListItem {
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

const API_BASE = (
  (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api'
).replace(/\/+$/, '');

export function apiBaseUrl(): string {
  return API_BASE;
}

function mapEventStatusToFrontend(status: string): EventStatus {
  switch (status) {
    case 'PUBLISHED':
      return 'published';
    case 'CANCELLED':
      return 'cancelled';
    case 'COMPLETED':
      return 'completed';
    default:
      return 'draft';
  }
}

function mapEventStatusToBackend(status: EventStatus | undefined): string {
  switch (status) {
    case 'published':
      return 'PUBLISHED';
    case 'cancelled':
      return 'CANCELLED';
    case 'completed':
      return 'COMPLETED';
    default:
      return 'DRAFT';
  }
}

function eventDtoToDetails(dto: ApiEventDto): EventDetails {
  const [city = '', country = ''] = dto.venueLocation.split(',').map((s) => s.trim());
  const announced = dto.movieTitle !== null && dto.movieTitle.trim().length > 0;
  return {
    id: dto.id,
    name: dto.title,
    tagline: HARAR_EVENT_SEED.tagline,
    dateLabel: dto.date,
    dateNote: HARAR_EVENT_SEED.dateNote,
    timeLabel: dto.startTime,
    timeNote: HARAR_EVENT_SEED.timeNote,
    venue: dto.venueName,
    city: city || dto.venueLocation,
    country,
    address: null,
    priceETB: dto.ticketPrice,
    snackIncluded: dto.freeSnack,
    snackNote: HARAR_EVENT_SEED.snackNote,
    capacityTotal: dto.capacity,
    capacityNote: HARAR_EVENT_SEED.capacityNote,
    status: mapEventStatusToFrontend(dto.status),
    movie: {
      status: announced ? 'announced' : 'tba',
      title: announced ? (dto.movieTitle as string) : null,
      tagline: null,
      synopsis: dto.movieSynopsis,
      runtimeMinutes: null,
      language: null,
      rating: null,
      posterUrl: dto.moviePoster,
      trailerUrl: dto.movieTrailer,
    },
  };
}

function mapBookingStatus(status: string): BookingStatus {
  switch (status) {
    case 'CONFIRMED':
      return 'confirmed';
    case 'CANCELLED':
    case 'EXPIRED':
      return 'cancelled';
    default:
      return 'pending_payment';
  }
}

function mapPaymentStatus(status: string): PaymentStatus {
  switch (status) {
    case 'PAID':
      return 'paid';
    case 'FAILED':
      return 'failed';
    case 'REFUNDED':
      return 'refunded';
    default:
      return 'pending';
  }
}

function bookingDtoToRecord(dto: ApiBookingDto): BookingRecord {
  const first = dto.tickets[0];
  return {
    id: dto.bookingReference,
    eventId: dto.eventId,
    customerName: dto.customerName,
    phone: dto.customerPhone,
    quantity: dto.quantity,
    totalETB: dto.totalAmount,
    status: mapBookingStatus(dto.status),
    paymentStatus: mapPaymentStatus(dto.paymentStatus),
    paymentMethodRaw: dto.paymentMethod,
    expiresAt: dto.expiresAt,
    ticketNumber: first?.ticketNumber ?? dto.bookingReference,
    qrPayload: first?.qrToken ? qrPayloadForToken(first.qrToken) : dto.bookingReference,
    createdAt: dto.createdAt,
    statusRaw: dto.status,
    paymentStatusRaw: dto.paymentStatus,
    tickets: dto.tickets.map((t) => ({
      ticketNumber: t.ticketNumber,
      qrToken: t.qrToken,
      status: t.status,
      validatedAt: t.validatedAt,
    })),
  };
}

function bookingListItemToRecord(item: ApiBookingListItem): BookingRecord {
  return {
    id: item.bookingReference,
    eventId: item.eventId,
    customerName: item.customerName,
    phone: item.customerPhone,
    quantity: item.quantity,
    totalETB: item.totalAmount,
    status: mapBookingStatus(item.status),
    paymentStatus: mapPaymentStatus(item.paymentStatus),
    ticketNumber: item.bookingReference,
    qrPayload: item.bookingReference,
    createdAt: item.createdAt,
    statusRaw: item.status,
    paymentStatusRaw: item.paymentStatus,
    eventTitle: item.eventTitle,
  };
}

/** Shared fetch helper (also used by admin auth). Throws ApiRequestError. */
export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      credentials: 'include',
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiRequestError(0, 'NETWORK_ERROR', 'Could not reach the server. Check your connection and try again.');
  }
  const data = (await res.json().catch(() => null)) as {
    error?: { code?: string; message?: string; details?: unknown };
  } | null;
  if (!res.ok) {
    const code = data?.error?.code ?? 'INTERNAL_ERROR';
    const message = data?.error?.message ?? 'Something went wrong. Please try again.';
    const details = data?.error?.details;
    if (code === 'SOLD_OUT') throw new CapacityError(0);
    if (code === 'INSUFFICIENT_CAPACITY') {
      const remaining = Number((details as { remaining?: unknown } | null)?.remaining ?? 0);
      throw new CapacityError(Number.isFinite(remaining) ? remaining : 0);
    }
    throw new ApiRequestError(res.status, code, message, details);
  }
  return data as T;
}

/* ------------------------------------------------------------------ */
/* HTTP implementation — the real backend                             */
/* ------------------------------------------------------------------ */

export class HttpEventsApi implements EventsApi {
  async getEvent(eventId: string): Promise<EventDetails> {
    const data = await apiRequest<{ event: ApiEventDto }>(
      `/events/${encodeURIComponent(eventId)}`,
    );
    return eventDtoToDetails(data.event);
  }

  async getCapacity(eventId: string): Promise<CapacitySnapshot> {
    const data = await apiRequest<{ event: ApiEventDto }>(
      `/events/${encodeURIComponent(eventId)}`,
    );
    return {
      total: data.event.capacity,
      sold: data.event.soldSeats,
      remaining: data.event.availableSeats,
      isSoldOut: data.event.isSoldOut,
    };
  }

  async createBooking(input: CreateBookingInput): Promise<BookingRecord> {
    const data = await apiRequest<{ booking: ApiBookingDto }>('/bookings', {
      method: 'POST',
      headers: input.idempotencyKey ? { 'Idempotency-Key': input.idempotencyKey } : {},
      body: JSON.stringify({
        eventId: input.eventId,
        customerName: input.customerName,
        phone: input.phone,
        quantity: input.quantity,
      }),
    });
    return bookingDtoToRecord(data.booking);
  }

  async getBooking(reference: string): Promise<BookingRecord | null> {
    try {
      const data = await apiRequest<{ booking: ApiBookingDto }>(
        `/admin/bookings/${encodeURIComponent(reference.trim().toUpperCase())}`,
      );
      return bookingDtoToRecord(data.booking);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 404) return null;
      throw err;
    }
  }

  async listBookings(eventId?: string): Promise<BookingRecord[]> {
    const query = eventId ? `?eventId=${encodeURIComponent(eventId)}&limit=200` : '?limit=200';
    const data = await apiRequest<{ bookings: ApiBookingListItem[] }>(
      `/admin/bookings${query}`,
    );
    return data.bookings.map(bookingListItemToRecord);
  }

  async validateTicket(token: string): Promise<TicketValidation> {
    const data = await apiRequest<{ validation: TicketValidation }>('/admin/tickets/validate', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
    return data.validation;
  }

  async listPaymentMethods(): Promise<PaymentMethodInfo[]> {
    const data = await apiRequest<{ methods: PaymentMethodInfo[] }>('/payments/methods');
    return data.methods;
  }

  async initiatePayment(reference: string, method: PaymentMethodCode): Promise<InitiatePaymentResult> {
    return apiRequest<InitiatePaymentResult>(
      `/bookings/${encodeURIComponent(reference.trim().toUpperCase())}/payment`,
      { method: 'POST', body: JSON.stringify({ paymentMethod: method }) },
    );
  }

  async getPaymentStatus(reference: string, phone: string): Promise<PaymentStatusView> {
    const data = await apiRequest<{ booking: ApiBookingDto; payment: PaymentAttempt | null }>(
      `/bookings/${encodeURIComponent(reference.trim().toUpperCase())}/payment?phone=${encodeURIComponent(phone)}`,
    );
    return { booking: bookingDtoToRecord(data.booking), payment: data.payment };
  }

  async verifyPaymentNow(reference: string, phone: string): Promise<VerifyPaymentResult> {
    const data = await apiRequest<{ booking: ApiBookingDto; payment: PaymentAttempt | null; verification: string }>(
      `/bookings/${encodeURIComponent(reference.trim().toUpperCase())}/payment/verify`,
      { method: 'POST', body: JSON.stringify({ phone }) },
    );
    return {
      booking: bookingDtoToRecord(data.booking),
      payment: data.payment,
      verification: data.verification,
    };
  }

  async getPublicBooking(reference: string, phone: string): Promise<BookingRecord | null> {
    try {
      const data = await apiRequest<{ booking: ApiBookingDto }>(
        `/bookings/${encodeURIComponent(reference.trim().toUpperCase())}?phone=${encodeURIComponent(phone)}`,
      );
      return bookingDtoToRecord(data.booking);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 404) return null;
      throw err;
    }
  }

  async listPayments(): Promise<PaymentLedgerItem[]> {
    const data = await apiRequest<{ payments: PaymentLedgerItem[]; total: number }>(
      '/admin/payments?limit=200',
    );
    return data.payments;
  }

  async listEvents(): Promise<EventDetails[]> {
    const data = await apiRequest<{ events: ApiEventDto[] }>('/admin/events');
    return data.events.map(eventDtoToDetails);
  }

  async createEvent(input: NewEventInput): Promise<EventDetails> {
    const data = await apiRequest<{ event: ApiEventDto }>('/admin/events', {
      method: 'POST',
      body: JSON.stringify({
        title: input.title,
        date: input.dateLabel,
        startTime: input.timeLabel,
        venueName: input.venue,
        venueLocation: [input.city, input.country].filter(Boolean).join(', '),
        ticketPrice: input.priceETB,
        capacity: input.capacityTotal,
        freeSnack: input.snackIncluded ?? true,
        status: mapEventStatusToBackend(input.status ?? 'draft'),
      }),
    });
    return eventDtoToDetails(data.event);
  }

  async updateEvent(event: EventDetails): Promise<EventDetails> {
    const data = await apiRequest<{ event: ApiEventDto }>(
      `/admin/events/${encodeURIComponent(event.id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          title: event.name,
          movieTitle: event.movie.title,
          moviePoster: event.movie.posterUrl,
          movieTrailer: event.movie.trailerUrl,
          movieSynopsis: event.movie.synopsis,
          date: event.dateLabel,
          startTime: event.timeLabel,
          venueName: event.venue,
          venueLocation: [event.city, event.country].filter(Boolean).join(', '),
          ticketPrice: event.priceETB,
          capacity: event.capacityTotal,
          freeSnack: event.snackIncluded,
          status: mapEventStatusToBackend(event.status),
        }),
      },
    );
    return eventDtoToDetails(data.event);
  }
}

/* ------------------------------------------------------------------ */
/* Mock implementation — pure-frontend development only                */
/* ------------------------------------------------------------------ */

const EVENT_KEY = 'hoc.event.v2';
const BOOKINGS_KEY = 'hoc.bookings.v2';

function randomCode(length: number): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

function ticketNumberFor(seq: number): string {
  return `HOC-2019-${String(seq).padStart(4, '0')}-${randomCode(3)}`;
}

function seedSampleBookings(event: EventDetails): BookingRecord[] {
  const names: Array<[string, string, number]> = [
    ['Hanna G.', '+251 911 204 318', 2],
    ['Dawit M.', '+251 922 781 045', 4],
    ['Selam T.', '+251 933 612 890', 2],
    ['Yonas A.', '+251 911 455 209', 3],
    ['Meron K.', '+251 922 308 771', 2],
  ];
  return names.map(([customerName, phone, quantity], i) => {
    const ticketNumber = ticketNumberFor(i + 1);
    const paid = i < 3;
    return {
      id: `sample-${i + 1}`,
      eventId: event.id,
      customerName,
      phone,
      quantity,
      totalETB: quantity * event.priceETB,
      status: paid ? 'confirmed' : 'pending_payment',
      paymentStatus: paid ? 'paid' : 'pending',
      ticketNumber,
      qrPayload: qrPayloadForToken(`sample-token-${i + 1}`),
      createdAt: new Date(Date.now() - (i + 1) * 36e5).toISOString(),
      statusRaw: paid ? 'CONFIRMED' : 'PENDING',
      paymentStatusRaw: paid ? 'PAID' : 'UNPAID',
      sample: true,
    } satisfies BookingRecord;
  });
}

function readBookings(event: EventDetails): BookingRecord[] {
  try {
    const raw = localStorage.getItem(BOOKINGS_KEY);
    if (raw) return JSON.parse(raw) as BookingRecord[];
  } catch {
    /* corrupted storage → reseed below */
  }
  const seeded = seedSampleBookings(event);
  try {
    localStorage.setItem(BOOKINGS_KEY, JSON.stringify(seeded));
  } catch {
    /* storage unavailable (private mode) — keep in-memory only */
  }
  return seeded;
}

function writeBookings(bookings: BookingRecord[]): void {
  try {
    localStorage.setItem(BOOKINGS_KEY, JSON.stringify(bookings));
  } catch {
    /* ignore — in-memory state still works for the session */
  }
}

function readEvent(): EventDetails {
  try {
    const raw = localStorage.getItem(EVENT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as EventDetails;
      if (parsed && parsed.id === HARAR_EVENT_SEED.id) {
        return { ...parsed, status: parsed.status ?? 'published' };
      }
    }
  } catch {
    /* fall through to seed */
  }
  return structuredClone(HARAR_EVENT_SEED);
}

export class MockEventsApi implements EventsApi {
  private event: EventDetails = readEvent();
  private bookings: BookingRecord[] = readBookings(this.event);

  private soldSeats(): number {
    return this.bookings
      .filter((b) => b.status !== 'cancelled')
      .reduce((sum, b) => sum + b.quantity, 0);
  }

  async getEvent(): Promise<EventDetails> {
    return structuredClone(this.event);
  }

  async getCapacity(): Promise<CapacitySnapshot> {
    const total = this.event.capacityTotal;
    const sold = Math.min(this.soldSeats(), total);
    const remaining = Math.max(0, total - sold);
    return { total, sold, remaining, isSoldOut: remaining <= 0 };
  }

  async createBooking(input: CreateBookingInput): Promise<BookingRecord> {
    const name = input.customerName.trim();
    const phone = input.phone.trim();
    if (name.length < 2) throw new Error('Customer name is required.');
    if (!phone) throw new Error('Phone number is required.');
    if (!Number.isInteger(input.quantity) || input.quantity < 1) {
      throw new Error('Quantity must be at least 1.');
    }

    const capacity = await this.getCapacity();
    if (input.quantity > capacity.remaining) {
      throw new CapacityError(capacity.remaining);
    }

    const seq = this.bookings.length + 1;
    const ticketNumber = ticketNumberFor(seq);
    const record: BookingRecord = {
      id: `bk_${Date.now().toString(36)}_${randomCode(4)}`,
      eventId: this.event.id,
      customerName: name,
      phone,
      quantity: input.quantity,
      totalETB: input.quantity * this.event.priceETB,
      status: 'pending_payment',
      paymentStatus: 'pending',
      ticketNumber,
      qrPayload: qrPayloadForToken(`mock-${seq}-${randomCode(6)}`),
      createdAt: new Date().toISOString(),
      statusRaw: 'PENDING',
      paymentStatusRaw: 'UNPAID',
    };
    this.bookings = [...this.bookings, record];
    writeBookings(this.bookings);
    return structuredClone(record);
  }

  async getBooking(id: string): Promise<BookingRecord | null> {
    const found = this.bookings.find((b) => b.id === id) ?? null;
    if (!found) return null;
    const record = structuredClone(found);
    record.tickets = Array.from({ length: record.quantity }, (_, i) => ({
      ticketNumber: `${record.ticketNumber}-S${i + 1}`,
      status: 'ACTIVE',
      validatedAt: null,
    }));
    return record;
  }

  async listBookings(): Promise<BookingRecord[]> {
    return structuredClone(
      [...this.bookings].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }

  async validateTicket(token: string): Promise<TicketValidation> {
    const code = token.trim();
    if (!code) throw new Error('Ticket code is required.');
    const found = this.bookings.find(
      (b) => b.ticketNumber.toUpperCase() === code.toUpperCase() || b.qrPayload.endsWith(code),
    );
    if (!found) {
      return {
        outcome: 'INVALID',
        message: 'Ticket not found. Do not admit.',
        ticketNumber: null,
        customerName: null,
        quantity: null,
        bookingReference: null,
        paymentStatus: null,
        paymentPending: false,
        validatedAt: null,
        eventTitle: this.event.name,
      };
    }
    const paid = found.paymentStatus === 'paid';
    return {
      outcome: 'VALID',
      message: paid ? 'Valid ticket — admit guest.' : 'Valid ticket — payment not yet verified.',
      ticketNumber: found.ticketNumber,
      customerName: found.customerName,
      quantity: found.quantity,
      bookingReference: found.id,
      paymentStatus: paid ? 'PAID' : 'UNPAID',
      paymentPending: !paid,
      validatedAt: new Date().toISOString(),
      eventTitle: this.event.name,
    };
  }

  async listPaymentMethods(): Promise<PaymentMethodInfo[]> {
    // Mock mode has no providers — every method is honestly "coming soon".
    return (Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethodCode[]).map((method) => ({
      method,
      label: PAYMENT_METHOD_LABELS[method],
      provider: null,
      available: false,
    }));
  }

  async initiatePayment(): Promise<InitiatePaymentResult> {
    throw new Error('Online payment is coming soon — no payment provider is connected in preview mode.');
  }

  async getPaymentStatus(): Promise<PaymentStatusView> {
    throw new Error('Online payment is coming soon — no payment provider is connected in preview mode.');
  }

  async verifyPaymentNow(): Promise<VerifyPaymentResult> {
    throw new Error('Online payment is coming soon — no payment provider is connected in preview mode.');
  }

  async getPublicBooking(reference: string, phone: string): Promise<BookingRecord | null> {
    const ref = reference.trim().toUpperCase();
    const digits = phone.replace(/\D/g, '');
    const found =
      this.bookings.find(
        (b) =>
          (b.id.toUpperCase() === ref || b.ticketNumber.toUpperCase() === ref) &&
          b.phone.replace(/\D/g, '').endsWith(digits.slice(-9)),
      ) ?? null;
    if (!found) return null;
    return this.getBooking(found.id);
  }

  async listPayments(): Promise<PaymentLedgerItem[]> {
    return [...this.bookings]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((b) => ({
        id: `mock-${b.id}`,
        bookingReference: b.ticketNumber,
        customerName: b.customerName,
        customerPhone: b.phone,
        eventTitle: this.event.name,
        paymentMethod: '',
        provider: '',
        providerTransactionId: null,
        providerReference: null,
        providerMethod: null,
        amount: b.totalETB,
        currency: 'ETB',
        status: b.paymentStatus === 'paid' ? 'PAID' : 'PENDING',
        failureReason: null,
        createdAt: b.createdAt,
        updatedAt: b.createdAt,
        verifiedAt: b.paymentStatus === 'paid' ? b.createdAt : null,
      }));
  }

  async listEvents(): Promise<EventDetails[]> {
    return [structuredClone(this.event)];
  }

  async createEvent(input: NewEventInput): Promise<EventDetails> {
    const created: EventDetails = {
      ...structuredClone(HARAR_EVENT_SEED),
      id: `evt-mock-${Date.now().toString(36)}`,
      name: input.title,
      dateLabel: input.dateLabel,
      timeLabel: input.timeLabel,
      venue: input.venue,
      city: input.city,
      country: input.country,
      priceETB: input.priceETB,
      capacityTotal: input.capacityTotal,
      snackIncluded: input.snackIncluded ?? true,
      status: input.status ?? 'draft',
    };
    this.event = created;
    this.bookings = [];
    writeBookings(this.bookings);
    try {
      localStorage.setItem(EVENT_KEY, JSON.stringify(this.event));
    } catch {
      /* ignore */
    }
    return structuredClone(created);
  }

  async updateEvent(event: EventDetails): Promise<EventDetails> {
    this.event = structuredClone(event);
    try {
      localStorage.setItem(EVENT_KEY, JSON.stringify(this.event));
    } catch {
      /* ignore */
    }
    return structuredClone(this.event);
  }
}

/* ------------------------------------------------------------------ */
/* Factory — mock only when explicitly requested                       */
/* ------------------------------------------------------------------ */

let httpSingleton: EventsApi | null = null;
let mockSingleton: EventsApi | null = null;

export function isMockApi(): boolean {
  return (import.meta.env.VITE_USE_MOCK_API as string | undefined) === 'true';
}

/**
 * Returns the active API client: the real HTTP backend by default, or the
 * localStorage mock when `VITE_USE_MOCK_API=true` (pure-frontend dev).
 */
export function getApi(): EventsApi {
  if (isMockApi()) {
    mockSingleton ??= new MockEventsApi();
    return mockSingleton;
  }
  httpSingleton ??= new HttpEventsApi();
  return httpSingleton;
}

/** Test hook: replace the singletons (e.g. fresh mock per test). */
export function __setApiForTests(api: EventsApi | null): void {
  httpSingleton = api;
  mockSingleton = api;
}

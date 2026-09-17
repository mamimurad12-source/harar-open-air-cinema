/** Row → API DTO mappers (snake_case rows become camelCase JSON). */
import type { BookingRow, EventRow, PaymentRow, TicketRow } from '../db/types';

export interface EventDto {
  id: string;
  title: string;
  movieTitle: string | null;
  moviePoster: string | null;
  movieTrailer: string | null;
  movieSynopsis: string | null;
  /** Display label, e.g. "9-1-2019 EC" (Ethiopian calendar). */
  date: string;
  /** Display label, e.g. "11:00 LT" (local time). */
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
  createdAt: string;
  updatedAt: string;
}

export function toEventDto(row: EventRow): EventDto {
  const soldSeats = Math.min(row.reserved_seats, row.capacity);
  const availableSeats = Math.max(0, row.capacity - row.reserved_seats);
  return {
    id: row.id,
    title: row.title,
    movieTitle: row.movie_title,
    moviePoster: row.movie_poster,
    movieTrailer: row.movie_trailer,
    movieSynopsis: row.movie_synopsis,
    date: row.event_date,
    startTime: row.start_time,
    venueName: row.venue_name,
    venueLocation: row.venue_location,
    ticketPrice: row.ticket_price,
    capacity: row.capacity,
    freeSnack: row.free_snack === 1,
    status: row.status,
    soldSeats,
    availableSeats,
    isSoldOut: availableSeats <= 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface TicketDto {
  id: string;
  ticketNumber: string;
  qrToken: string;
  status: string;
  validatedAt: string | null;
  createdAt: string;
}

export function toTicketDto(row: TicketRow): TicketDto {
  return {
    id: row.id,
    ticketNumber: row.ticket_number,
    qrToken: row.qr_token,
    status: row.status,
    validatedAt: row.validated_at,
    createdAt: row.created_at,
  };
}

export interface BookingDto {
  id: string;
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
  updatedAt: string;
  tickets: TicketDto[];
  event?: EventDto;
}

export interface PaymentDto {
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

export function toPaymentDto(row: PaymentRow, bookingReference: string): PaymentDto {
  return {
    id: row.id,
    bookingReference,
    paymentMethod: row.payment_method,
    provider: row.provider,
    providerTransactionId: row.provider_transaction_id,
    providerReference: row.provider_reference,
    providerMethod: row.provider_method,
    amount: row.amount,
    currency: row.currency,
    status: row.status,
    failureReason: row.failure_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    verifiedAt: row.verified_at,
  };
}

export interface PaymentLedgerItem extends PaymentDto {
  customerName: string;
  customerPhone: string;
  eventTitle: string;
}

export function toBookingDto(
  row: BookingRow,
  tickets: TicketRow[],
  event?: EventRow,
): BookingDto {
  return {
    id: row.id,
    bookingReference: row.booking_reference,
    eventId: row.event_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    quantity: row.quantity,
    totalAmount: row.total_amount,
    status: row.status,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tickets: tickets.map(toTicketDto),
    event: event ? toEventDto(event) : undefined,
  };
}

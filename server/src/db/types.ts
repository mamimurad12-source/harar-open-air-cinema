/** Row shapes as stored in Postgres. API DTOs are mapped in services/dto.ts. */

export type EventStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'COMPLETED';
export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED';
export type PaymentStatus = 'UNPAID' | 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
export type TicketStatus = 'PENDING' | 'ACTIVE' | 'USED' | 'CANCELLED';
export type AdminRole = 'ADMIN' | 'STAFF';
export type PaymentMethod = 'EBIRR' | 'COOPAY' | 'CBE' | 'TELEBIRR' | 'MOBILE_BANKING';
export type PaymentRowStatus = 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED' | 'CANCELLED';

export interface EventRow {
  id: string;
  title: string;
  movie_title: string | null;
  movie_poster: string | null;
  movie_trailer: string | null;
  movie_synopsis: string | null;
  event_date: string;
  start_time: string;
  venue_name: string;
  venue_location: string;
  ticket_price: number;
  capacity: number;
  reserved_seats: number;
  free_snack: number;
  status: EventStatus;
  created_at: string;
  updated_at: string;
}

export interface BookingRow {
  id: string;
  booking_reference: string;
  event_id: string;
  customer_name: string;
  customer_phone: string;
  quantity: number;
  total_amount: number;
  status: BookingStatus;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TicketRow {
  id: string;
  booking_id: string;
  ticket_number: string;
  qr_token: string;
  status: TicketStatus;
  validated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentRow {
  id: string;
  booking_id: string;
  payment_method: PaymentMethod;
  provider: string;
  provider_transaction_id: string | null;
  provider_reference: string | null;
  provider_method: string | null;
  amount: number;
  currency: string;
  status: PaymentRowStatus;
  failure_reason: string | null;
  init_payload: string | null;
  verify_payload: string | null;
  created_at: string;
  updated_at: string;
  verified_at: string | null;
}

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: AdminRole;
  created_at: string;
}

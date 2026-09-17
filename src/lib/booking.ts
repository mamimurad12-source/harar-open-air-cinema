/**
 * BOOKING DOMAIN LOGIC (framework-free, fully testable)
 * ------------------------------------------------------------------
 * Future customer flow this module is designed around:
 *
 *   Select event → Select quantity → Name + phone → Review →
 *   Payment → Payment verification → Unique ticket + QR → Digital ticket
 *
 * IMPORTANT: capacity/oversell protection MUST be enforced server-side.
 * The helpers here are optimistic UX guards only (disable the "+"
 * button, show "sold out", ...). The real backend must decrement
 * availability inside a transaction when confirming payment.
 */

export type BookingStep = 'seats' | 'details' | 'review' | 'ticket';

export const BOOKING_STEPS: Array<{ id: BookingStep; label: string }> = [
  { id: 'seats', label: 'Seats' },
  { id: 'details', label: 'Details' },
  { id: 'review', label: 'Review' },
  { id: 'ticket', label: 'Ticket' },
];

export interface BookingDraft {
  quantity: number;
  customerName: string;
  phone: string;
}

export const INITIAL_DRAFT: BookingDraft = {
  quantity: 2,
  customerName: '',
  phone: '',
};

/** Phone rules live in `shared/validation.ts` so frontend and backend agree. */
import { isValidEthiopianPhone } from '../../shared/validation';

export { isValidEthiopianPhone, normalizePhone } from '../../shared/validation';

export interface DraftErrors {
  customerName?: string;
  phone?: string;
  quantity?: string;
}

export function validateDraft(draft: BookingDraft, remaining: number): DraftErrors {
  const errors: DraftErrors = {};
  if (draft.customerName.trim().length < 2) {
    errors.customerName = 'Please enter the name for this booking.';
  }
  if (!isValidEthiopianPhone(draft.phone)) {
    errors.phone = 'Enter a valid Ethiopian mobile number (e.g. 0911 12 34 56).';
  }
  if (!Number.isInteger(draft.quantity) || draft.quantity < 1) {
    errors.quantity = 'Choose at least 1 ticket.';
  } else if (draft.quantity > remaining) {
    errors.quantity =
      remaining <= 0 ? 'This event is sold out.' : `Only ${remaining} seats left.`;
  }
  return errors;
}

export function orderTotal(priceETB: number, quantity: number): number {
  return priceETB * quantity;
}

export function clampQuantity(quantity: number, remaining: number): number {
  if (remaining <= 0) return 0;
  return Math.min(Math.max(1, Math.floor(quantity) || 1), remaining);
}

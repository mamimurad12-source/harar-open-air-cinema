/** Server-side unique identifier generation (crypto-random, no PII inside). */
import { randomBytes, randomUUID } from 'node:crypto';

export function newId(): string {
  return randomUUID();
}

/** Unambiguous alphabet (no 0/O, 1/I/L) for human-read codes. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function randomCode(length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

/** Public booking reference, e.g. HOC-X7K4P2 */
export function newBookingReference(): string {
  return `HOC-${randomCode(6)}`;
}

/** Human ticket number printed on the ticket. */
export function newTicketNumber(): string {
  return `HOC-2019-${randomCode(6)}`;
}

/** Opaque QR token — the ONLY thing a QR code encodes. No customer data. */
export function newQrToken(): string {
  return `hct_${randomBytes(16).toString('hex')}`;
}

/** Full QR payload (still just the opaque token, namespaced). */
export function qrPayloadFor(qrToken: string): string {
  return `harar-cinema://ticket/${qrToken}`;
}

/** Accepts either the raw token or the full QR payload from a scanner. */
export function extractQrToken(input: string): string {
  const trimmed = input.trim();
  if (trimmed.includes('://')) {
    const after = trimmed.split('/').pop() ?? '';
    return after.trim();
  }
  return trimmed;
}

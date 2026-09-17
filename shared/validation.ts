/**
 * Shared validation helpers — imported by BOTH the frontend (Vite) and the
 * backend (tsx). Framework-free, dependency-free. Server-side checks are the
 * source of truth; the frontend mirrors them for instant UX feedback.
 */

/** Accepts 09/07… (10 digits) or +251 9/7… */
export function isValidEthiopianPhone(raw: string): boolean {
  const phone = raw.replace(/[\s-]/g, '');
  return /^(\+251(9|7)\d{8}|0(9|7)\d{8})$/.test(phone);
}

/** Normalizes to the international format: +251 9XX XXX XXX */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const local = digits.startsWith('251') ? digits.slice(3) : digits.replace(/^0/, '');
  return `+251 ${local}`;
}

/** Display-safe name check (length only — no over-strict character rules). */
export function isValidCustomerName(raw: string): boolean {
  const name = raw.trim();
  return name.length >= 2 && name.length <= 80;
}

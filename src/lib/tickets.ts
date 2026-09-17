/** QR payload helpers — the code carries an opaque token only, never PII. */

export function qrPayloadForToken(qrToken: string): string {
  return `harar-cinema://ticket/${qrToken}`;
}

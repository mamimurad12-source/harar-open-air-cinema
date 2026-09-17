/** Small formatting helpers shared across the app. */

export function formatETB(amount: number): string {
  return `${new Intl.NumberFormat('en-ET').format(amount)} ETB`;
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}

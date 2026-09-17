/**
 * Site-wide configuration: brand, navigation, and external links.
 *
 * Social / contact links are PLACEHOLDERS until the organizers supply
 * the real profiles. A `null` href renders as a "coming soon" chip
 * instead of a dead link.
 */

export interface SocialLink {
  id: 'instagram' | 'tiktok' | 'telegram' | 'phone';
  label: string;
  href: string | null;
  handle: string | null;
}

export const SITE = {
  brand: 'Harar Open Air Cinema',
  brandShort: 'Harar Cinema',
  tagline: 'Good Movies • Great Company • Perfect Vibes',
  city: 'Harar, Ethiopia',
  localeNote: 'Dates shown in the Ethiopian calendar • Time in local time (LT)',
  currency: 'ETB' as const,
} as const;

export const NAV_LINKS = [
  { id: 'movie', label: 'Movie', href: '/#movie' },
  { id: 'experience', label: 'Experience', href: '/#experience' },
  { id: 'venue', label: 'Venue', href: '/#venue' },
  { id: 'tickets', label: 'Tickets', href: '/#tickets' },
  { id: 'faq', label: 'FAQ', href: '/#faq' },
] as const;

export const SOCIALS: SocialLink[] = [
  { id: 'instagram', label: 'Instagram', href: null, handle: null },
  { id: 'tiktok', label: 'TikTok', href: null, handle: null },
  { id: 'telegram', label: 'Telegram', href: null, handle: null },
  { id: 'phone', label: 'Contact', href: null, handle: null },
];

export const LEGAL_LINKS = [
  { id: 'terms', label: 'Terms', href: null as string | null },
  { id: 'privacy', label: 'Privacy', href: null as string | null },
];

/** Shown wherever organizer-supplied info is still missing. */
export const PENDING_INFO = 'Details will be announced by the organizers.';

/**
 * EVENT DATA — MOCK / SEED LAYER
 * ------------------------------------------------------------------
 * Everything in this file is local seed data that mirrors the shape a
 * real backend will return. Components should NEVER import this file
 * directly — they consume it through the API layer (`src/lib/api.ts`)
 * via the `useEvent()` / `useCapacity()` hooks, so swapping in a real
 * backend later means changing one factory, not every component.
 *
 * Only facts verified from the official poster are included below.
 * Anything unknown is explicitly marked `null` / "coming soon".
 */

export interface MovieInfo {
  /** 'tba' until the organizers announce the film. Never invent a title. */
  status: 'tba' | 'announced';
  title: string | null;
  tagline: string | null;
  synopsis: string | null;
  runtimeMinutes: number | null;
  language: string | null;
  rating: string | null;
  posterUrl: string | null;
  trailerUrl: string | null;
}

export type EventStatus = 'draft' | 'published' | 'cancelled' | 'completed';

export interface EventDetails {
  id: string;
  name: string;
  /** Publishing state (backend-owned; defaults to published for the seed). */
  status: EventStatus;
  tagline: string;
  /** Displayed exactly as printed on the poster. */
  dateLabel: string;
  dateNote: string;
  /** Displayed exactly as printed on the poster (LT = local time). */
  timeLabel: string;
  timeNote: string;
  venue: string;
  city: string;
  country: string;
  /** No street address was provided — do not invent one. */
  address: string | null;
  priceETB: number;
  snackIncluded: boolean;
  snackNote: string;
  /** Poster says "approximately 100 people". Treated as capacity 100. */
  capacityTotal: number;
  capacityNote: string;
  movie: MovieInfo;
}

export const MOVIE_TBA_LABEL = 'Movie title coming soon';

export const HARAR_EVENT_SEED: EventDetails = {
  id: 'harar-open-air-cinema-001',
  name: 'Harar Open Air Cinema',
  status: 'published',
  tagline: 'Good Movies • Great Company • Perfect Vibes',
  dateLabel: '9 — 1 — 2019 EC',
  dateNote: 'Ethiopian calendar',
  timeLabel: '11:00 LT',
  timeNote: 'Local time',
  venue: 'Arthur Rimbaud Museum',
  city: 'Harar',
  country: 'Ethiopia',
  address: null,
  priceETB: 250,
  snackIncluded: true,
  snackNote: 'Free snack included with every ticket',
  capacityTotal: 100,
  capacityNote: 'Limited to around 100 guests',
  movie: {
    status: 'tba',
    title: null,
    tagline: null,
    synopsis: null,
    runtimeMinutes: null,
    language: null,
    rating: null,
    posterUrl: null,
    trailerUrl: null,
  },
};

export interface FaqItem {
  question: string;
  answer: string;
}

export const FAQS: FaqItem[] = [
  {
    question: 'How much is a ticket?',
    answer:
      'A ticket is 250 ETB, and a free snack is included with every ticket.',
  },
  {
    question: 'Is a snack really included?',
    answer:
      'Yes — every ticket comes with a free snack, as shown on the official event poster.',
  },
  {
    question: 'Where is the event?',
    answer:
      'The screening takes place at the Arthur Rimbaud Museum in Harar, Ethiopia.',
  },
  {
    question: 'When is the event?',
    answer:
      'The event is scheduled for 9-1-2019 EC at 11:00 local time (LT), as shown on the official poster.',
  },
  {
    question: 'How do I receive my ticket?',
    answer:
      'Online booking is open now. At checkout, choose any available payment method — eBirr, Coopay, CBE, telebirr, or mobile banking (methods not yet connected are marked coming soon). Your scannable QR tickets appear automatically after verified payment.',
  },
  {
    question: 'Can I buy multiple tickets?',
    answer:
      'Yes — you will be able to book several seats in one order, while seats remain. The event is limited to around 100 guests.',
  },
  {
    question: 'What happens at the entrance?',
    answer:
      'Details will be announced by the organizers. Please keep your ticket (or booking confirmation) ready to show at the gate.',
  },
  {
    question: 'What movie will be shown?',
    answer:
      'The movie title has not been announced yet. Check back soon — the featured film will be published here as soon as the organizers confirm it.',
  },
];

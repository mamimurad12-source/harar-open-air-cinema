import type { EventDetails } from '../data/event';
import { Reveal, SectionHeading } from './ui';

export function Venue({ event }: { event: EventDetails }) {
  return (
    <section id="venue" className="scroll-mt-20 bg-cream-200/50 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Venue"
          title="A historic night at the"
          accent="Rimbaud Museum."
          description="Cinema beneath the stars, hosted at one of Harar's beloved landmarks."
        />

        <div className="mt-10 grid gap-5 lg:mt-14 lg:grid-cols-2">
          {/* Location card */}
          <Reveal>
            <article className="relative h-full overflow-hidden rounded-3xl bg-ink-950 p-7 text-cream-50 shadow-xl sm:p-9">
              <div className="stars absolute inset-0 opacity-40" aria-hidden="true" />
              <div className="absolute -top-16 -right-16 h-48 w-48 rounded-full bg-wine-600/40 blur-3xl" aria-hidden="true" />
              <div className="relative">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gold-400/15 text-gold-300 ring-1 ring-gold-400/30">
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
                </span>
                <h3 className="mt-5 font-display text-2xl font-black sm:text-3xl">
                  {event.venue}
                </h3>
                <p className="mt-1 text-sm font-bold tracking-[0.18em] text-gold-300 uppercase">
                  {event.city}, {event.country}
                </p>
                <dl className="mt-6 space-y-3 text-sm">
                  <div className="flex items-center gap-3 rounded-2xl bg-cream-50/[0.06] px-4 py-3 ring-1 ring-cream-50/10">
                    <span className="text-cream-100/60">📅</span>
                    <div>
                      <dt className="sr-only">Date</dt>
                      <dd className="font-bold">
                        {event.dateLabel}{' '}
                        <span className="font-semibold text-cream-100/60">({event.dateNote})</span>
                      </dd>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-2xl bg-cream-50/[0.06] px-4 py-3 ring-1 ring-cream-50/10">
                    <span className="text-cream-100/60">🕚</span>
                    <div>
                      <dt className="sr-only">Time</dt>
                      <dd className="font-bold">
                        {event.timeLabel}{' '}
                        <span className="font-semibold text-cream-100/60">({event.timeNote})</span>
                      </dd>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-2xl bg-cream-50/[0.06] px-4 py-3 ring-1 ring-cream-50/10">
                    <span className="text-cream-100/60">🎟️</span>
                    <div>
                      <dt className="sr-only">Admission</dt>
                      <dd className="font-bold">
                        {event.priceETB} ETB{' '}
                        <span className="font-semibold text-cream-100/60">• Free snack included</span>
                      </dd>
                    </div>
                  </div>
                </dl>
                <p className="mt-5 text-xs leading-relaxed font-semibold text-cream-100/55">
                  Coming from outside Harar? Plan to arrive early — doors and exact entry details
                  will be announced by the organizers.
                </p>
              </div>
            </article>
          </Reveal>

          {/* Map placeholder — Google Maps embed slots in here later */}
          <Reveal delayMs={100}>
            <div className="relative flex h-full min-h-[320px] flex-col overflow-hidden rounded-3xl bg-cream-50 ring-1 ring-ink-950/10">
              {/* Stylized faux-map backdrop */}
              <div
                className="absolute inset-0 opacity-90"
                aria-hidden="true"
                style={{
                  backgroundImage: `
                    radial-gradient(circle at 68% 34%, rgba(168,50,50,0.16) 0 90px, transparent 91px),
                    repeating-linear-gradient(0deg, transparent 0 34px, rgba(18,13,8,0.06) 34px 35px),
                    repeating-linear-gradient(90deg, transparent 0 46px, rgba(18,13,8,0.06) 46px 47px),
                    linear-gradient(115deg, transparent 46%, rgba(117,26,26,0.14) 46% 47.5%, transparent 47.6%),
                    linear-gradient(28deg, transparent 62%, rgba(18,13,8,0.10) 62% 63.5%, transparent 63.6%),
                    linear-gradient(#FAF4E6, #F3E9D2)
                  `,
                }}
              />
              <div className="absolute top-[30%] left-[62%] -translate-x-1/2 -translate-y-1/2" aria-hidden="true">
                <span className="absolute -inset-5 animate-ping rounded-full bg-wine-500/20" />
                <span className="animate-float-soft relative grid h-12 w-12 place-items-center rounded-full bg-wine-700 text-cream-50 shadow-xl ring-4 ring-cream-50">
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
                </span>
              </div>
              <div className="relative mt-auto p-5 sm:p-6">
                <div className="rounded-2xl bg-ink-950/90 p-4 text-cream-50 shadow-lg backdrop-blur-sm sm:p-5">
                  <p className="flex items-center gap-2 text-[11px] font-extrabold tracking-[0.2em] text-gold-300 uppercase">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-gold-300" />
                    Interactive map — coming soon
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed font-semibold text-cream-100/85">
                    {event.venue}, {event.city}, {event.country}. A live Google Map with
                    directions will be embedded here.
                  </p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

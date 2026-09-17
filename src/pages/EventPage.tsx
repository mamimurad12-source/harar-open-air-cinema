/** Dedicated "View Event" page: full screening detail + ticket CTA. */
import { MovieSection } from '../components/MovieSection';
import { Venue } from '../components/Venue';
import { DigitalTicketPreview } from '../components/DigitalTicket';
import { PrimaryButton, GhostButton, Reveal, SectionHeading } from '../components/ui';
import { useEvent } from '../lib/useEvent';
import { formatETB, pluralize } from '../lib/format';

export function EventPage() {
  const { event, capacity } = useEvent();
  const remaining = capacity?.remaining ?? event.capacityTotal;

  return (
    <main className="bg-cream-100">
      {/* Page hero */}
      <section className="grain relative overflow-hidden bg-ink-950 pt-28 pb-14 text-cream-50 sm:pt-36 sm:pb-20">
        <div className="absolute inset-0 bg-[radial-gradient(110%_80%_at_50%_0%,#2b1a12_0%,#1c1410_50%,#120d08_100%)]" />
        <div className="stars animate-twinkle absolute inset-0" aria-hidden="true" />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <p className="text-[11px] font-extrabold tracking-[0.28em] text-gold-300 uppercase">
              Event details
            </p>
            <h1 className="mt-3 max-w-2xl font-display text-4xl leading-[1.02] font-black text-balance sm:text-6xl">
              A night at the movies, <span className="text-gold-300 italic">Harar style.</span>
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed font-semibold text-cream-100/80">
              {event.name} invites you to {event.venue} on {event.dateLabel} at{' '}
              {event.timeLabel} — {formatETB(event.priceETB)} a ticket, free snack included.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-2 text-[13px] font-bold">
              <span className="rounded-full bg-cream-50/10 px-4 py-2 ring-1 ring-cream-50/15">
                📅 {event.dateLabel}
              </span>
              <span className="rounded-full bg-cream-50/10 px-4 py-2 ring-1 ring-cream-50/15">
                🕚 {event.timeLabel} {event.timeNote}
              </span>
              <span className="rounded-full bg-cream-50/10 px-4 py-2 ring-1 ring-cream-50/15">
                📍 {event.venue}
              </span>
              <span className="rounded-full bg-gold-400/15 px-4 py-2 text-gold-300 ring-1 ring-gold-400/30">
                {remaining} {pluralize(remaining, 'seat')} left
              </span>
            </div>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <PrimaryButton to="/book" className="bg-cream-50! text-ink-950! hover:bg-white!">
                Book Your Ticket →
              </PrimaryButton>
              <GhostButton to="/#tickets" className="text-cream-50">
                See pricing
              </GhostButton>
            </div>
          </Reveal>
        </div>
        <div className="film-strip absolute inset-x-0 bottom-0 h-7" aria-hidden="true" />
      </section>

      {/* Official poster, straight from the organizers */}
      <section className="bg-cream-100 py-14 sm:py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-[1.25fr_1fr]">
          <Reveal>
            <figure className="relative mx-auto max-w-xl -rotate-1 rounded-2xl bg-cream-50 p-3 pb-4 shadow-[0_30px_60px_-25px_rgba(18,13,8,0.5)] ring-1 ring-ink-950/15 transition-transform duration-300 hover:rotate-0">
              <span className="absolute -top-3 left-8 h-7 w-20 rotate-[-8deg] rounded-sm bg-gold-300/70 shadow-sm" aria-hidden="true" />
              <span className="absolute -top-3 right-8 h-7 w-20 rotate-[8deg] rounded-sm bg-gold-300/70 shadow-sm" aria-hidden="true" />
              <img
                src="/poster.jpg"
                alt="Official Harar Open Air Cinema event poster"
                className="w-full rounded-xl ring-1 ring-ink-950/10"
                loading="lazy"
              />
              <figcaption className="pt-2.5 text-center font-display text-sm font-bold text-ink-500 italic">
                The official invitation — you&rsquo;re invited ♡
              </figcaption>
            </figure>
          </Reveal>
          <Reveal delayMs={120}>
            <p className="text-[11px] font-extrabold tracking-[0.24em] text-wine-700 uppercase">
              From the organizers
            </p>
            <h2 className="mt-3 font-display text-3xl leading-tight font-black text-balance sm:text-4xl">
              Everything on the poster, <span className="text-wine-700 italic">confirmed.</span>
            </h2>
            <ul className="mt-6 space-y-3">
              {[
                `Date — ${event.dateLabel} (${event.dateNote})`,
                `Time — ${event.timeLabel} (${event.timeNote})`,
                `Venue — ${event.venue}, ${event.city}`,
                `Ticket — ${formatETB(event.priceETB)}, free snack included`,
              ].map((fact) => (
                <li key={fact} className="flex items-center gap-3 rounded-2xl bg-cream-50 px-4 py-3 text-sm font-extrabold text-ink-900 ring-1 ring-ink-950/10">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-700/10 text-emerald-700 ring-1 ring-emerald-700/25">
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                  </span>
                  {fact}
                </li>
              ))}
              <li className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-gold-500/60 bg-gold-500/10 px-4 py-3 text-sm font-extrabold text-ink-900">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gold-500/20 text-gold-600">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
                </span>
                Movie — title coming soon
              </li>
            </ul>
            <div className="mt-6">
              <PrimaryButton to="/book">Book Your Ticket →</PrimaryButton>
            </div>
          </Reveal>
        </div>
      </section>

      <MovieSection event={event} />
      <Venue event={event} />

      {/* Ticket preview band */}
      <section className="bg-cream-200/50 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading
            eyebrow="After booking"
            title="Your digital"
            accent="QR ticket."
            description="One ticket per booking, verified at the gate. This is a sample of what you'll receive."
          />
          <Reveal className="mt-10" delayMs={100}>
            <DigitalTicketPreview event={event} />
          </Reveal>
        </div>
      </section>
    </main>
  );
}

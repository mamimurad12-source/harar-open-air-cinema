/** Full booking page: the BookingFlow plus a trust sidebar. */
import { Link } from 'react-router-dom';
import { BookingFlow } from '../components/BookingFlow';
import { Reveal } from '../components/ui';
import { useEvent } from '../lib/useEvent';
import { formatETB } from '../lib/format';

const TRUST_POINTS = [
  { title: 'No account needed', text: 'Book with just your name and phone number.' },
  { title: 'Honest pricing', text: '250 ETB flat — free snack always included.' },
  { title: 'Seats are reserved', text: 'Availability is checked live before confirming.' },
  { title: 'Payment coming soon', text: 'Nothing is charged until real payment goes live.' },
];

export function BookPage() {
  const { event, capacity, refresh } = useEvent();

  return (
    <main className="bg-cream-100">
      <section className="grain relative overflow-hidden bg-ink-950 pt-28 pb-10 text-cream-50 sm:pt-36">
        <div className="absolute inset-0 bg-[radial-gradient(110%_80%_at_50%_0%,#2b1a12_0%,#1c1410_50%,#120d08_100%)]" />
        <div className="stars absolute inset-0 opacity-70" aria-hidden="true" />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <Link to="/" className="text-[13px] font-bold text-cream-100/60 transition-colors hover:text-cream-50">
              ← Back to home
            </Link>
            <h1 className="mt-3 font-display text-4xl font-black text-balance sm:text-5xl">
              Book your <span className="text-gold-300 italic">night out.</span>
            </h1>
            <p className="mt-3 max-w-xl text-[15px] font-semibold text-cream-100/75">
              {event.name} • {event.dateLabel} • {event.timeLabel} • {event.venue} •{' '}
              {formatETB(event.priceETB)} + free snack
            </p>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
          <Reveal>
            <BookingFlow event={event} capacity={capacity} onCapacityChange={refresh} />
          </Reveal>
          <Reveal delayMs={120}>
            <aside className="space-y-3 lg:sticky lg:top-24">
              <div className="rounded-3xl bg-ink-950 p-6 text-cream-50">
                <p className="text-[11px] font-extrabold tracking-[0.22em] text-gold-300 uppercase">
                  Why book with us
                </p>
                <ul className="mt-4 space-y-4">
                  {TRUST_POINTS.map((point) => (
                    <li key={point.title} className="flex gap-3">
                      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-500/20 text-emerald-300">
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                      </span>
                      <span>
                        <span className="block text-sm font-extrabold">{point.title}</span>
                        <span className="block text-[13px] leading-snug font-semibold text-cream-100/65">
                          {point.text}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-3xl bg-cream-50 p-6 ring-1 ring-ink-950/10">
                <p className="font-display text-lg font-black">Need help?</p>
                <p className="mt-1 text-[13px] leading-relaxed font-semibold text-ink-500">
                  Booking support contact details will be announced by the organizers.
                </p>
              </div>
            </aside>
          </Reveal>
        </div>
      </section>
    </main>
  );
}

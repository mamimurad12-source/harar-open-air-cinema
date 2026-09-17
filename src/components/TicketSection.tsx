/** Pricing + booking CTA band with a mini "how booking works" strip. */
import { Link } from 'react-router-dom';
import type { CapacitySnapshot } from '../lib/api';
import type { EventDetails } from '../data/event';
import { formatETB, pluralize } from '../lib/format';
import { PrimaryButton, Reveal, SectionHeading } from './ui';

interface TicketSectionProps {
  event: EventDetails;
  capacity: CapacitySnapshot | null;
}

const FLOW_STEPS = [
  { n: '1', title: 'Pick seats', text: 'Choose how many tickets you need.' },
  { n: '2', title: 'Your details', text: 'Just a name and phone — no account.' },
  { n: '3', title: 'Pay online', text: 'Choose your payment method at checkout.' },
  { n: '4', title: 'Get QR ticket', text: 'Scannable tickets after verified payment.' },
];

export function TicketSection({ event, capacity }: TicketSectionProps) {
  const soldOut = capacity?.isSoldOut ?? false;
  const remaining = capacity?.remaining ?? event.capacityTotal;
  const pctSold = capacity ? Math.round((capacity.sold / capacity.total) * 100) : 0;

  return (
    <section id="tickets" className="scroll-mt-20 bg-cream-100 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Tickets"
          title="One price."
          accent="One unforgettable night."
          description="Simple, honest pricing — the snack is on us."
        />

        <div className="mt-10 grid items-stretch gap-5 lg:mt-14 lg:grid-cols-[1.1fr_1fr]">
          {/* Price card */}
          <Reveal>
            <article className="relative flex h-full flex-col overflow-hidden rounded-3xl bg-wine-700 p-7 text-cream-50 shadow-[0_24px_60px_-24px_rgba(117,26,26,0.7)] sm:p-9">
              <div className="stars absolute inset-0 opacity-30" aria-hidden="true" />
              <div className="absolute -right-10 -bottom-14 font-display text-[11rem] leading-none font-black text-cream-50/10 select-none" aria-hidden="true">
                ♥
              </div>
              <div className="relative flex h-full flex-col">
                <p className="text-[11px] font-extrabold tracking-[0.24em] text-gold-300 uppercase">
                  General admission
                </p>
                <div className="mt-4">
                  <span className="inline-block -rotate-2 rounded-2xl bg-cream-50 px-7 py-2 font-display text-5xl font-black text-wine-700 shadow-xl ring-1 ring-cream-50/30 sm:text-6xl">
                    {event.priceETB} <span className="text-3xl sm:text-4xl">Birr</span>
                  </span>
                  <p className="mt-2 text-sm font-bold text-cream-100/85">per person</p>
                  <p className="mt-4 font-script text-4xl text-gold-300 sm:text-5xl">Free Snack</p>
                  <p className="mt-1 font-display text-sm font-bold text-cream-100/85 italic">
                    Enjoy the movie, good vibes and great company!
                  </p>
                </div>

                <ul className="mt-6 space-y-2.5 text-sm font-semibold">
                  {[
                    'Full open-air screening',
                    'Free snack included',
                    'Limited to ≈ 100 guests',
                    'No account needed to book',
                  ].map((perk) => (
                    <li key={perk} className="flex items-center gap-2.5">
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-gold-400/20 text-gold-300">
                        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                      </span>
                      {perk}
                    </li>
                  ))}
                </ul>

                {/* Availability */}
                <div className="mt-6 rounded-2xl bg-ink-950/30 p-4 ring-1 ring-cream-50/15">
                  {soldOut ? (
                    <p className="text-sm font-extrabold text-gold-300">Sold out — see you next time ♥</p>
                  ) : (
                    <>
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="font-extrabold">
                          {remaining} {pluralize(remaining, 'seat')} left
                        </span>
                        <span className="text-xs font-bold text-cream-100/70">{pctSold}% claimed</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-950/50">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-gold-400 to-gold-300 transition-all duration-700"
                          style={{ width: `${pctSold}%` }}
                        />
                      </div>
                    </>
                  )}
                </div>

                <div className="mt-6">
                  {soldOut ? (
                    <span className="inline-flex w-full cursor-not-allowed items-center justify-center rounded-full bg-cream-50/20 px-7 py-3.5 text-sm font-extrabold tracking-wide text-cream-50/70">
                      Sold Out
                    </span>
                  ) : (
                    <PrimaryButton to="/book" className="w-full bg-cream-50! text-[15px] text-ink-950! hover:bg-white! sm:w-auto sm:px-10">
                      Book Your Ticket <span aria-hidden="true">→</span>
                    </PrimaryButton>
                  )}
                  <p className="mt-3 text-xs leading-relaxed font-semibold text-cream-100/70">
                    Online payment is being connected. Booking now reserves your seats as pending —
                    nothing is charged until real payment goes live.
                  </p>
                </div>
              </div>
            </article>
          </Reveal>

          {/* How it works */}
          <Reveal delayMs={100}>
            <div className="flex h-full flex-col gap-3">
              {FLOW_STEPS.map((step) => (
                <div
                  key={step.n}
                  className="flex flex-1 items-center gap-4 rounded-3xl bg-cream-50 p-5 ring-1 ring-ink-950/10 transition-all duration-300 hover:-translate-y-0.5 hover:ring-wine-600/30 sm:p-6"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink-950 font-display text-lg font-black text-gold-300">
                    {step.n}
                  </span>
                  <div>
                    <h3 className="font-display text-lg leading-tight font-black text-ink-950">
                      {step.title}
                    </h3>
                    <p className="mt-0.5 text-sm font-semibold text-ink-500">{step.text}</p>
                  </div>
                </div>
              ))}
              <Link
                to="/book"
                className="group flex items-center justify-between rounded-3xl bg-ink-950 p-5 text-cream-50 transition-all hover:bg-ink-900 sm:p-6"
              >
                <span className="text-sm font-bold">
                  Total for 2 tickets:{' '}
                  <span className="text-gold-300">{formatETB(event.priceETB * 2)}</span>
                  <span className="text-cream-100/60"> + free snacks</span>
                </span>
                <span className="grid h-9 w-9 place-items-center rounded-full bg-wine-600 transition-transform group-hover:translate-x-1" aria-hidden="true">
                  →
                </span>
              </Link>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

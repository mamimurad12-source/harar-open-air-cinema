import { Link } from 'react-router-dom';
import { Hero } from '../components/Hero';
import { Marquee } from '../components/Marquee';
import { MovieSection } from '../components/MovieSection';
import { Experience } from '../components/Experience';
import { Venue } from '../components/Venue';
import { TicketSection } from '../components/TicketSection';
import { DigitalTicketPreview } from '../components/DigitalTicket';
import { Faq } from '../components/Faq';
import { PrimaryButton, Reveal, SectionHeading } from '../components/ui';
import { useEvent } from '../lib/useEvent';

export function HomePage() {
  const { event, capacity } = useEvent();

  return (
    <main>
      <Hero event={event} remaining={capacity?.remaining ?? null} />
      <Marquee />
      <MovieSection event={event} />
      <Experience />
      <Venue event={event} />
      <TicketSection event={event} capacity={capacity} />

      {/* Digital ticket preview */}
      <section className="relative overflow-hidden bg-ink-950 py-16 sm:py-24">
        <div className="stars absolute inset-0 opacity-40" aria-hidden="true" />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading
            dark
            eyebrow="Your ticket"
            title="A ticket worth"
            accent="keeping."
            description="After verified payment, every guest receives a personal digital ticket with a unique QR code — like this one."
          />
          <Reveal className="mt-10" delayMs={100}>
            <div className="[&_span.bg-cream-100]:bg-ink-950!">
              <DigitalTicketPreview event={event} />
            </div>
            <p className="mx-auto mt-6 max-w-md text-center text-xs leading-relaxed font-semibold text-cream-100/55">
              Sample shown. Ticket numbers, guest names and QR codes are generated per booking
              after payment verification.
            </p>
            <div className="mt-6 text-center">
              <PrimaryButton to="/book">Book Your Ticket →</PrimaryButton>
            </div>
          </Reveal>
        </div>
      </section>

      <Faq />

      {/* Final CTA */}
      <section className="bg-cream-100 px-4 pt-4 pb-16 sm:px-6 sm:pb-24">
        <Reveal className="mx-auto max-w-6xl">
          <div className="relative overflow-hidden rounded-3xl bg-wine-700 px-6 py-12 text-center text-cream-50 shadow-xl sm:py-16">
            <div className="stars absolute inset-0 opacity-25" aria-hidden="true" />
            <div className="relative">
              <p className="text-[11px] font-extrabold tracking-[0.28em] text-gold-300 uppercase">
                {event.dateLabel} • {event.timeLabel} • {event.venue}
              </p>
              <h2 className="mx-auto mt-3 max-w-xl font-display text-3xl leading-tight font-black text-balance sm:text-5xl">
                <span className="block font-script text-4xl font-normal text-gold-300 sm:text-6xl">
                  Enjoy the movie,
                </span>
                good vibes &amp; great company!
              </h2>
              <p className="mt-3 text-[15px] font-semibold text-cream-100/85">
                The stars are waiting — {event.tagline}
              </p>
              <div className="mt-7">
                <Link
                  to="/book"
                  className="inline-flex items-center gap-2 rounded-full bg-cream-50 px-9 py-4 text-[15px] font-extrabold tracking-wide text-ink-950 shadow-lg transition-all hover:bg-white active:scale-[0.98]"
                >
                  Book Your Ticket <span aria-hidden="true">→</span>
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </section>
    </main>
  );
}

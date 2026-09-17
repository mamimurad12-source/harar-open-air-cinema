/**
 * Cinematic night-sky hero with a cream "invitation ticket" at its heart —
 * a direct homage to the official poster: YOU'RE INVITED TO / HARAR /
 * Open Air Cinema script / red ADMIT ONE stub, hearts and sparkles.
 */
import { Link } from 'react-router-dom';
import type { EventDetails } from '../data/event';
import { MOVIE_TBA_LABEL } from '../data/event';
import { GhostButton, LightButton } from './ui';

interface HeroProps {
  event: EventDetails;
  remaining: number | null;
}

function Heart({ className, solid = true }: { className?: string; solid?: boolean }) {
  return solid ? (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12 21s-7.5-4.7-9.6-9.3C1 8.6 2.9 5.9 5.7 5.9c2 0 3.4 1.1 4.2 2.5h4.2c.8-1.4 2.2-2.5 4.2-2.5 2.8 0 4.7 2.7 3.3 5.8C19.5 16.3 12 21 12 21z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className={className}>
      <path d="M12 20.5S4 15.6 2.7 11C1.7 7.7 3.8 5.4 6.4 5.4c1.7 0 3 .9 3.7 2.1h3.8c.7-1.2 2-2.1 3.7-2.1 2.6 0 4.7 2.3 3.7 5.6C20 15.6 12 20.5 12 20.5z" />
    </svg>
  );
}

function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12 2c.7 5.6 3.4 8.3 9 9-5.6.7-8.3 3.4-9 9-.7-5.6-3.4-8.3-9-9 5.6-.7 8.3-3.4 9-9z" />
    </svg>
  );
}

/** line — heart — line divider, straight off the poster. */
function HeartDivider({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2" aria-hidden="true">
      <span className={`h-px flex-1 ${light ? 'bg-cream-50/40' : 'bg-wine-700/50'}`} />
      <Heart className={`h-3 w-3 ${light ? 'text-gold-300' : 'text-wine-600'}`} />
      <span className={`h-px flex-1 ${light ? 'bg-cream-50/40' : 'bg-wine-700/50'}`} />
    </div>
  );
}

function InfoColumn({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 px-1 text-center">
      <span className="text-wine-600">{icon}</span>
      <span className="text-[10px] font-extrabold tracking-[0.22em] text-ink-800 uppercase">{label}</span>
      <span className="font-display text-[15px] leading-tight font-black text-ink-950 sm:text-base">{value}</span>
      {sub && <span className="text-[10px] font-bold text-ink-400">{sub}</span>}
    </div>
  );
}

export function Hero({ event, remaining }: HeroProps) {
  return (
    <section className="grain relative overflow-hidden bg-ink-950 text-cream-50">
      {/* Sky */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_0%,#2b1a12_0%,#1c1410_45%,#120d08_100%)]" />
      <div className="stars-deep animate-twinkle-slow absolute inset-0 opacity-70" />
      <div className="stars animate-twinkle absolute inset-0" />

      {/* Moon */}
      <div className="absolute top-24 right-[8%] hidden sm:block" aria-hidden="true">
        <div className="animate-float-soft relative h-20 w-20 rounded-full bg-[radial-gradient(circle_at_35%_35%,#fdfbf4_0%,#e7d6b0_55%,#c9b282_100%)] shadow-[0_0_60px_10px_rgba(232,206,122,0.25)]">
          <div className="absolute top-4 left-5 h-3 w-3 rounded-full bg-cream-300/70" />
          <div className="absolute top-9 left-9 h-2 w-2 rounded-full bg-cream-300/60" />
          <div className="absolute top-11 left-4 h-1.5 w-1.5 rounded-full bg-cream-300/60" />
        </div>
      </div>

      {/* Projector beam */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center" aria-hidden="true">
        <div className="animate-sway h-[46rem] w-[130%] max-w-none origin-bottom bg-[conic-gradient(from_168deg_at_50%_100%,transparent_0deg,rgba(250,244,230,0.13)_8deg,rgba(250,244,230,0.02)_16deg,transparent_20deg)] blur-[1px] sm:w-[90%]" />
      </div>

      {/* String lights */}
      <svg
        className="absolute inset-x-0 top-16 h-28 w-full text-cream-100/70 sm:top-14"
        viewBox="0 0 800 110"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d="M-10 8 Q 200 78 400 30 T 810 18" fill="none" stroke="currentColor" strokeWidth="1.4" opacity="0.5" />
        {[60, 140, 225, 315, 405, 495, 585, 672, 748].map((x, i) => {
          const y = [34, 47, 53, 51, 41, 33, 30, 27, 24][i] ?? 30;
          return (
            <g key={x}>
              <line x1={x} y1={y - 8} x2={x} y2={y} stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
              <circle
                cx={x}
                cy={y + 5}
                r="4.4"
                fill="#E8CE7A"
                opacity="0.95"
                className="animate-bulb"
                style={{ animationDelay: `${i * 0.35}s` }}
              />
              <circle cx={x} cy={y + 5} r="8" fill="#E8CE7A" opacity="0.18" />
            </g>
          );
        })}
      </svg>

      {/* Content */}
      <div className="relative mx-auto max-w-6xl px-4 pt-28 pb-14 text-center sm:px-6 sm:pt-36 sm:pb-20">
        <p className="inline-flex items-center gap-2 rounded-full bg-cream-50/10 px-4 py-1.5 text-[11px] font-extrabold tracking-[0.24em] text-gold-300 uppercase ring-1 ring-gold-400/30 backdrop-blur-sm">
          <Heart className="h-3 w-3" />
          Harar • Ethiopia • Open Air
          <Heart className="h-3 w-3" />
        </p>

        {/* ————— The invitation ticket ————— */}
        <div className="relative mx-auto mt-6 max-w-3xl">
          <Sparkle className="animate-twinkle absolute -top-5 -left-2 h-6 w-6 text-gold-300 sm:-left-6" />
          <Sparkle className="animate-twinkle-slow absolute -right-2 -bottom-4 h-8 w-8 text-gold-300/80 sm:-right-5" />
          <Heart className="animate-float-soft absolute top-1/3 -left-3 hidden h-7 w-7 -rotate-12 text-wine-400 sm:block" solid={false} />
          <Heart className="animate-float-soft absolute -right-4 top-10 hidden h-5 w-5 rotate-12 text-wine-400 sm:block" />

          <h1 className="overflow-hidden rounded-[26px] bg-cream-50 text-ink-950 shadow-[0_40px_90px_-30px_rgba(0,0,0,0.8)] ring-1 ring-cream-50/20">
            <span className="sr-only">Harar Open Air Cinema — {event.tagline}</span>
            <div className="flex flex-col md:flex-row" aria-hidden="false">
              {/* Main invitation */}
              <div className="relative flex-1 px-5 py-7 sm:px-10 sm:py-9">
                {/* poster double-rule frame */}
                <span className="pointer-events-none absolute inset-2 rounded-[20px] border-2 border-wine-700/60 outline-1 outline-offset-[5px] outline-wine-700/30" aria-hidden="true" />

                <p className="flex items-center justify-center gap-2 text-[11px] font-extrabold tracking-[0.3em] text-ink-900 uppercase sm:text-xs">
                  <Heart className="h-3.5 w-3.5 text-wine-600" solid={false} />
                  You&rsquo;re invited to
                  <Heart className="h-3.5 w-3.5 text-wine-600" solid={false} />
                </p>
                <span className="mt-2 block font-display text-[17vw] leading-[0.95] font-black tracking-tight text-ink-950 sm:text-7xl lg:text-[5.2rem]">
                  HARAR
                </span>
                <span className="relative mt-1 inline-block font-script text-[11vw] leading-none text-wine-600 sm:text-6xl">
                  Open Air Cinema
                  <svg viewBox="0 0 300 14" className="absolute -bottom-2 left-1/2 w-[85%] -translate-x-1/2 text-wine-600" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                    <path d="M4 9 C 80 3, 220 3, 296 8" />
                  </svg>
                </span>
                <p className="mt-5 text-[10px] font-extrabold tracking-[0.24em] text-ink-800 uppercase sm:text-[11px]">
                  {event.tagline}
                </p>

                <div className="mx-auto mt-4 max-w-md">
                  <HeartDivider />
                </div>

                {/* Poster info columns */}
                <div className="mx-auto mt-4 grid max-w-lg grid-cols-2 gap-x-2 gap-y-4 sm:grid-cols-4">
                  <InfoColumn
                    label="Movie"
                    value="Coming soon"
                    icon={
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="12" height="10" rx="2" /><path d="M15 10.5l6-3.5v10l-6-3.5M7 7V5M11 7V5" /></svg>
                    }
                  />
                  <InfoColumn
                    label="Date"
                    value={event.dateLabel}
                    sub={event.dateNote}
                    icon={
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /></svg>
                    }
                  />
                  <InfoColumn
                    label="Time"
                    value={event.timeLabel}
                    sub={event.timeNote}
                    icon={
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
                    }
                  />
                  <InfoColumn
                    label="Venue"
                    value={event.venue}
                    sub={`${event.city}, ${event.country}`}
                    icon={
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
                    }
                  />
                </div>

                <div className="mt-5">
                  <p className="font-script text-3xl text-wine-600 sm:text-4xl">
                    <span className="mr-2 align-middle text-lg" aria-hidden="true">—</span>
                    Free Snack
                    <span className="ml-2 align-middle text-lg" aria-hidden="true">—</span>
                  </p>
                  <p className="mt-1 font-display text-[13px] font-bold text-ink-800 italic sm:text-sm">
                    Enjoy the movie, good vibes and great company!
                  </p>
                </div>
              </div>

              {/* Perforation */}
              <div className="relative flex shrink-0 items-stretch md:flex-col" aria-hidden="true">
                <span className="absolute top-1/2 -left-3 h-6 w-6 -translate-y-1/2 rounded-full bg-ink-900 ring-1 ring-cream-50/20 md:top-auto md:-top-3 md:-left-[13px] md:translate-y-0" />
                <div className="ticket-dash-h mx-10 my-auto flex-1 md:ticket-dash-v md:mx-auto md:my-10" />
                <span className="absolute top-1/2 -right-3 h-6 w-6 -translate-y-1/2 rounded-full bg-ink-900 ring-1 ring-cream-50/20 md:top-auto md:-right-[13px] md:-bottom-3 md:translate-y-0" />
              </div>

              {/* Red ADMIT ONE stub — desktop */}
              <div className="relative hidden w-60 shrink-0 flex-col items-center justify-center gap-3 bg-wine-700 px-5 py-8 text-center text-cream-50 md:flex">
                <span className="pointer-events-none absolute inset-2 rounded-[16px] border border-dashed border-cream-50/40" aria-hidden="true" />
                <Heart className="h-5 w-5 text-cream-50" solid={false} />
                <p className="font-display text-[1.65rem] leading-none font-black tracking-wide">
                  ADMIT ONE
                </p>
                <p className="text-[10px] font-extrabold tracking-[0.3em] text-cream-100/85 uppercase">
                  — Cinema Night —
                </p>
                <div className="w-full rounded-xl border border-cream-50/50 px-3 py-2.5">
                  <p className="font-script text-xl leading-snug">Same movie<br />Better company</p>
                  <Heart className="mx-auto mt-1 h-3 w-3" />
                </div>
                <p className="rounded-xl bg-cream-50 px-5 py-2 font-display text-2xl font-black text-wine-700 shadow-lg">
                  {event.priceETB} Birr
                </p>
                <p className="flex items-center gap-2 text-[11px] font-extrabold tracking-[0.3em] uppercase">
                  <Heart className="h-3 w-3" /> Enjoy! <Heart className="h-3 w-3" />
                </p>
              </div>

              {/* Red strip — mobile */}
              <div className="flex items-center justify-center gap-x-3 gap-y-1 bg-wine-700 px-4 py-3 text-center text-cream-50 md:hidden">
                <span className="font-display text-lg font-black tracking-wide">ADMIT ONE</span>
                <Heart className="h-3 w-3 shrink-0 text-gold-300" />
                <span className="rounded-lg bg-cream-50 px-2.5 py-0.5 font-display text-base font-black text-wine-700">
                  {event.priceETB} Birr
                </span>
                <Heart className="h-3 w-3 shrink-0 text-gold-300" />
                <span className="text-[11px] font-extrabold tracking-[0.2em] uppercase">Enjoy!</span>
              </div>
            </div>
          </h1>
        </div>

        <p className="mx-auto mt-6 inline-flex items-center gap-2 rounded-full border border-dashed border-cream-50/30 px-4 py-1.5 text-xs font-bold tracking-wide text-cream-100/75">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-gold-300" />
          Featured film: {MOVIE_TBA_LABEL}
          {remaining !== null && (
            <span className="text-gold-300">• {remaining} seats left</span>
          )}
        </p>

        <div className="mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <LightButton to="/book" className="w-full text-[15px] sm:w-auto">
            Book Your Ticket
            <span aria-hidden="true">→</span>
          </LightButton>
          <GhostButton to="/event" className="w-full text-cream-50 sm:w-auto">
            View Event
          </GhostButton>
        </div>

        <p className="mt-5 text-[11px] font-semibold tracking-[0.14em] text-cream-100/50 uppercase">
          {event.dateNote} • {event.timeNote} • {event.city}, {event.country}
        </p>
      </div>

      {/* Old-city silhouette */}
      <svg
        className="relative block h-20 w-full text-ink-950 sm:h-28"
        viewBox="0 0 1200 120"
        preserveAspectRatio="xMidYMax slice"
        aria-hidden="true"
      >
        <path
          d="M0 120V86l40-6 14-22 18 4 10-16 22 2 8 14 30-4 12-30 16 2 6 22 26 4 10-12 24 2 14 20 30-2 8-34a10 10 0 0 1 20 0l8 34 30 2 14-20 24-2 10 12 26-4 6-22 16-2 12 30 30 4 8-14 22-2 10 16 18-4 14 22 40 6v34H0z"
          fill="currentColor"
        />
        <g fill="#E8CE7A" opacity="0.85">
          <rect x="120" y="72" width="5" height="7" rx="1" />
          <rect x="330" y="66" width="5" height="7" rx="1" />
          <rect x="560" y="70" width="5" height="7" rx="1" />
          <rect x="760" y="64" width="5" height="7" rx="1" />
          <rect x="980" y="70" width="5" height="7" rx="1" />
        </g>
      </svg>
      <div className="film-strip h-9" aria-hidden="true" />

      <Link
        to="/#movie"
        aria-label="Scroll to featured movie"
        className="animate-cue absolute bottom-16 left-1/2 hidden -translate-x-1/2 text-cream-100/70 transition-colors hover:text-cream-50 sm:block"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
      </Link>
    </section>
  );
}

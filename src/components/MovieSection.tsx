/**
 * Featured-movie spotlight. Driven entirely by `event.movie`, so publishing
 * the real film later is a data change — no component edits needed.
 * While `movie.status === 'tba'` every slot renders an honest placeholder.
 */
import type { EventDetails } from '../data/event';
import { MOVIE_TBA_LABEL } from '../data/event';
import { PENDING_INFO } from '../config/site';
import { Reveal, SectionHeading, StatusPill } from './ui';

function MetaRow({ label, value, pending = false }: { label: string; value: string; pending?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-dashed border-ink-950/15 py-2.5 last:border-0">
      <dt className="text-[11px] font-extrabold tracking-[0.16em] text-ink-500 uppercase">{label}</dt>
      <dd className={`text-right text-sm font-bold ${pending ? 'text-ink-400 italic' : 'text-ink-950'}`}>
        {value}
      </dd>
    </div>
  );
}

function PosterPlaceholder() {
  return (
    <div className="relative mx-auto aspect-[2/3] w-full max-w-[300px] overflow-hidden rounded-2xl bg-ink-950 shadow-[0_24px_50px_-20px_rgba(18,13,8,0.55)] ring-1 ring-ink-950/20">
      {/* Poster frame inner border */}
      <div className="absolute inset-3 rounded-xl border border-cream-50/15" aria-hidden="true" />
      <div className="stars absolute inset-0 opacity-60" aria-hidden="true" />
      {/* Moon + hearts motif */}
      <div className="absolute inset-x-0 top-10 flex flex-col items-center" aria-hidden="true">
        <div className="h-16 w-16 rounded-full bg-[radial-gradient(circle_at_35%_35%,#fdfbf4_0%,#e7d6b0_60%,#c9b282_100%)] shadow-[0_0_40px_6px_rgba(232,206,122,0.3)]" />
        <svg viewBox="0 0 24 24" className="mt-4 h-8 w-8 text-wine-500" fill="currentColor">
          <path d="M12 21s-7.5-4.7-9.6-9.3C1 8.6 2.9 5.9 5.7 5.9c2 0 3.4 1.1 4.2 2.5h4.2c.8-1.4 2.2-2.5 4.2-2.5 2.8 0 4.7 2.7 3.3 5.8C19.5 16.3 12 21 12 21z" />
        </svg>
      </div>
      <div className="absolute inset-x-0 bottom-0 p-5 text-center">
        <p className="text-[10px] font-extrabold tracking-[0.3em] text-gold-300 uppercase">
          Harar Open Air Cinema
        </p>
        <p className="mt-2 font-display text-2xl leading-tight font-black text-cream-50 italic">
          {MOVIE_TBA_LABEL}
        </p>
        <p className="mt-2 text-[11px] font-semibold text-cream-100/60">
          Official poster artwork coming soon
        </p>
      </div>
      {/* Clapper strip */}
      <div className="absolute inset-x-0 top-0 flex" aria-hidden="true">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className={`h-3 flex-1 ${i % 2 === 0 ? 'bg-cream-50' : 'bg-ink-950'} border-b border-ink-950/40`} />
        ))}
      </div>
    </div>
  );
}

function TrailerPlaceholder() {
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-ink-950 ring-1 ring-ink-950/20">
      <div className="stars absolute inset-0 opacity-50" aria-hidden="true" />
      <div className="absolute inset-0 bg-[radial-gradient(90%_100%_at_50%_100%,rgba(168,50,50,0.25)_0%,transparent_60%)]" aria-hidden="true" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-cream-50/10 ring-1 ring-cream-50/25 backdrop-blur-sm">
          <svg viewBox="0 0 24 24" className="h-7 w-7 translate-x-0.5 text-cream-50" fill="currentColor" aria-hidden="true">
            <path d="M8 5.5v13l11-6.5-11-6.5z" />
          </svg>
        </span>
        <p className="font-display text-xl font-bold text-cream-50 italic">Trailer coming soon</p>
        <p className="max-w-xs text-xs leading-relaxed font-semibold text-cream-100/60">
          The official trailer will play here once the featured film is announced.
        </p>
      </div>
      <div className="film-strip absolute inset-x-0 bottom-0 h-6 opacity-90" aria-hidden="true" />
    </div>
  );
}

export function MovieSection({ event }: { event: EventDetails }) {
  const { movie } = event;
  const isTba = movie.status === 'tba';

  return (
    <section id="movie" className="scroll-mt-20 bg-cream-100 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Featured Screening"
          title="One night."
          accent="One film."
          description="The centerpiece of the evening — screening under the Harari night sky."
        />

        <div className="mt-10 grid items-start gap-8 lg:mt-14 lg:grid-cols-[320px_1fr] lg:gap-12">
          <Reveal>
            {isTba || !movie.posterUrl ? (
              <PosterPlaceholder />
            ) : (
              <img
                src={movie.posterUrl}
                alt={movie.title ?? 'Featured movie poster'}
                className="mx-auto aspect-[2/3] w-full max-w-[300px] rounded-2xl object-cover shadow-xl ring-1 ring-ink-950/20"
              />
            )}
          </Reveal>

          <div>
            <Reveal delayMs={80}>
              <div className="flex flex-wrap items-center gap-2">
                {isTba ? (
                  <StatusPill tone="warning">To be announced</StatusPill>
                ) : (
                  <StatusPill tone="success">Now showing</StatusPill>
                )}
                <StatusPill tone="muted">
                  {event.dateLabel} • {event.timeLabel}
                </StatusPill>
              </div>
              <h3 className="mt-4 font-display text-3xl leading-tight font-black text-ink-950 text-balance sm:text-4xl">
                {isTba || !movie.title ? (
                  <span className="italic">{MOVIE_TBA_LABEL}</span>
                ) : (
                  movie.title
                )}
              </h3>
              {movie.tagline && (
                <p className="mt-2 font-display text-lg text-wine-700 italic">{movie.tagline}</p>
              )}
            </Reveal>

            <Reveal delayMs={140}>
              <div className="mt-6 rounded-2xl bg-cream-50 p-5 ring-1 ring-ink-950/10 sm:p-6">
                <h4 className="text-[11px] font-extrabold tracking-[0.2em] text-ink-500 uppercase">
                  Synopsis
                </h4>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-800">
                  {movie.synopsis ?? 'The synopsis will be published here once the film is announced.'}
                </p>
                <dl className="mt-4">
                  <MetaRow label="Date" value={event.dateLabel} />
                  <MetaRow label="Time" value={`${event.timeLabel} (${event.timeNote})`} />
                  <MetaRow label="Venue" value={event.venue} />
                  <MetaRow
                    label="Runtime"
                    value={movie.runtimeMinutes ? `${movie.runtimeMinutes} min` : PENDING_INFO}
                    pending={!movie.runtimeMinutes}
                  />
                  <MetaRow
                    label="Language"
                    value={movie.language ?? PENDING_INFO}
                    pending={!movie.language}
                  />
                  <MetaRow
                    label="Rating"
                    value={movie.rating ?? PENDING_INFO}
                    pending={!movie.rating}
                  />
                </dl>
              </div>
            </Reveal>

            <Reveal delayMs={200} className="mt-6">
              {isTba || !movie.trailerUrl ? (
                <TrailerPlaceholder />
              ) : (
                <div className="aspect-video w-full overflow-hidden rounded-2xl bg-ink-950 ring-1 ring-ink-950/20">
                  <video src={movie.trailerUrl} controls preload="metadata" className="h-full w-full" />
                </div>
              )}
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}

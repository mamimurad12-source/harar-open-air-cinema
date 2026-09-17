/**
 * The keepsake cinema ticket — a faithful echo of the official poster:
 * cream invitation with red double-rule frame, script lettering, hearts,
 * and the red ADMIT ONE stub with barcode, QR slot, price badge & ENJOY!.
 */
import type { BookingRecord } from '../lib/api';
import type { EventDetails } from '../data/event';
import { MOVIE_TBA_LABEL } from '../data/event';
import { formatETB } from '../lib/format';
import { QrCode } from './QrCode';
import { QrPlaceholder } from './QrPlaceholder';
import { cn } from './ui';

interface DigitalTicketProps {
  event: EventDetails;
  booking: Pick<
    BookingRecord,
    'customerName' | 'ticketNumber' | 'quantity' | 'totalETB' | 'qrPayload'
  >;
  /** Preview/sample tickets get a watermark + "SAMPLE" ribbon. */
  sample?: boolean;
  /** Render the REAL scannable QR (only for verified bookings). */
  qrReal?: boolean;
  statusLabel?: string;
  className?: string;
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

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-extrabold tracking-[0.18em] text-ink-500 uppercase">{label}</p>
      <p className={cn('mt-0.5 truncate text-sm font-extrabold text-ink-950', mono && 'font-mono tracking-tight')}>
        {value}
      </p>
    </div>
  );
}

/** Decorative faux barcode — the real scannable code is the QR, issued after payment. */
function Barcode({ code }: { code: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        aria-hidden="true"
        className="h-10 w-44 rounded-sm bg-cream-50 px-2 py-1 ring-1 ring-ink-950/15"
        style={{
          backgroundImage:
            'repeating-linear-gradient(90deg, #120D08 0 2px, transparent 2px 4px, #120D08 4px 7px, transparent 7px 9px, #120D08 9px 10px, transparent 10px 14px)',
          backgroundClip: 'content-box',
        }}
      />
      <p className="font-mono text-[10px] font-bold tracking-[0.2em] text-ink-500">{code}</p>
    </div>
  );
}

export function DigitalTicket({
  event,
  booking,
  sample = false,
  qrReal = false,
  statusLabel,
  className,
}: DigitalTicketProps) {
  const movieTitle =
    event.movie.status === 'announced' && event.movie.title ? event.movie.title : MOVIE_TBA_LABEL;

  return (
    <div className={cn('relative mx-auto w-full max-w-3xl', className)}>
      {sample && (
        <div className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 -rotate-2 rounded-full bg-ink-950 px-4 py-1 text-[10px] font-extrabold tracking-[0.24em] text-gold-300 uppercase shadow-lg">
          ★ Sample ticket ★
        </div>
      )}

      <div className="overflow-hidden rounded-3xl bg-cream-50 shadow-[0_30px_70px_-30px_rgba(18,13,8,0.6)] ring-1 ring-ink-950/15">
        <div className="flex flex-col sm:flex-row">
          {/* Main invitation */}
          <div className="relative flex-1 p-5 sm:p-6">
            <span className="pointer-events-none absolute inset-2 rounded-[20px] border-2 border-wine-700/50 outline-1 outline-offset-[4px] outline-wine-700/25" aria-hidden="true" />
            {sample && (
              <span
                className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden font-display text-[7rem] font-black text-wine-700/[0.07] select-none"
                aria-hidden="true"
              >
                SAMPLE
              </span>
            )}
            <div className="relative px-1 py-1 sm:px-2">
              <div className="flex items-center justify-between gap-3">
                <p className="flex items-center gap-1.5 text-[10px] font-extrabold tracking-[0.22em] text-ink-900 uppercase">
                  <Heart className="h-3 w-3 text-wine-600" solid={false} />
                  You&rsquo;re invited to
                  <Heart className="h-3 w-3 text-wine-600" solid={false} />
                </p>
                {statusLabel && (
                  <span className="shrink-0 rounded-full bg-gold-500/15 px-2.5 py-1 text-[10px] font-extrabold tracking-wider text-gold-600 uppercase ring-1 ring-gold-500/40">
                    {statusLabel}
                  </span>
                )}
              </div>

              <p className="mt-1.5 font-display text-[2rem] leading-none font-black tracking-tight text-ink-950">
                HARAR
              </p>
              <p className="font-script text-[1.7rem] leading-tight text-wine-600">
                Open Air Cinema
              </p>
              <p className="mt-0.5 text-[10px] font-extrabold tracking-[0.2em] text-ink-500 uppercase">
                {event.tagline}
              </p>

              <div className="my-3 flex items-center gap-2" aria-hidden="true">
                <span className="h-px flex-1 bg-wine-700/40" />
                <Heart className="h-3 w-3 text-wine-600" />
                <span className="h-px flex-1 bg-wine-700/40" />
              </div>

              <p className="font-display text-lg leading-snug font-black text-ink-950">
                {movieTitle}
              </p>

              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
                <Field label="Guest" value={booking.customerName} />
                <Field label="Ticket №" value={booking.ticketNumber} mono />
                <Field label="Date" value={event.dateLabel} />
                <Field label="Time" value={`${event.timeLabel} ${event.timeNote}`} />
                <Field label="Venue" value={event.venue} />
                <Field label="Seats" value={`${booking.quantity} × ${formatETB(event.priceETB)}`} />
              </div>

              <div className="mt-4 flex items-center justify-between rounded-2xl bg-cream-200/60 px-4 py-2.5">
                <span className="text-xs font-extrabold tracking-wide text-ink-700 uppercase">
                  Total
                </span>
                <span className="font-display text-2xl font-black text-wine-700">
                  {formatETB(booking.totalETB)}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="flex items-center gap-1.5 text-[11px] font-bold text-ink-500">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-wine-600" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                  Free snack included — show this ticket at the entrance
                </p>
                <Barcode code={booking.ticketNumber} />
              </div>
            </div>
          </div>

          {/* Perforation + notches */}
          <div className="relative flex shrink-0 items-stretch sm:flex-col" aria-hidden="true">
            <span className="absolute -top-3 left-1/2 h-6 w-6 -translate-x-1/2 rounded-full bg-cream-100 ring-1 ring-ink-950/15 sm:top-auto sm:-bottom-3 sm:left-1/2" />
            <div className="ticket-dash-h mx-8 my-auto flex-1 sm:ticket-dash-v sm:mx-auto sm:my-8" />
            <span className="absolute -bottom-3 left-1/2 h-6 w-6 -translate-x-1/2 rounded-full bg-cream-100 ring-1 ring-ink-950/15 sm:top-auto sm:-top-3 sm:bottom-auto sm:left-1/2" />
          </div>

          {/* Red ADMIT ONE stub */}
          <div className="relative flex shrink-0 flex-col items-center gap-2.5 bg-wine-700 p-6 text-center text-cream-50 sm:w-56 sm:justify-center sm:p-5">
            <span className="pointer-events-none absolute inset-2 rounded-[16px] border border-dashed border-cream-50/40" aria-hidden="true" />
            <Heart className="h-4 w-4" solid={false} />
            <p className="font-display text-2xl leading-none font-black tracking-wide">ADMIT ONE</p>
            <p className="text-[9px] font-extrabold tracking-[0.3em] text-cream-100/85 uppercase">
              — Cinema Night —
            </p>
            <div className="w-full rounded-xl border border-cream-50/50 px-3 py-1.5">
              <p className="font-script text-lg leading-snug">Same movie, Better company</p>
            </div>
            {qrReal ? (
              <QrCode
                value={booking.qrPayload}
                label="Scan this code at the entrance."
                className="[&_svg]:h-24 [&_svg]:w-24 sm:[&_svg]:h-28 sm:[&_svg]:w-28 [&_figcaption]:text-cream-100/70"
              />
            ) : (
              <QrPlaceholder
                seed={booking.qrPayload}
                label="Your unique QR code will appear here after payment."
                className="[&_svg]:h-24 [&_svg]:w-24 sm:[&_svg]:h-28 sm:[&_svg]:w-28 [&_figcaption]:text-cream-100/70"
              />
            )}
            <p className="font-mono text-[10px] font-bold tracking-tight text-cream-100/80">
              {booking.ticketNumber}
            </p>
            <p className="rounded-xl bg-cream-50 px-4 py-1.5 font-display text-xl font-black text-wine-700 shadow">
              {event.priceETB} Birr
              <span className="ml-1 align-middle text-[11px] font-extrabold text-wine-700/70">
                × {booking.quantity}
              </span>
            </p>
            <p className="mt-1 flex items-center gap-2 text-[10px] font-extrabold tracking-[0.3em] uppercase">
              <Heart className="h-3 w-3" /> Enjoy! <Heart className="h-3 w-3" />
            </p>
          </div>
        </div>

        {/* Footer strip */}
        <div className="flex items-center justify-between gap-2 bg-ink-950 px-5 py-2.5 text-[10px] font-bold tracking-[0.14em] text-cream-100/70 uppercase">
          <span className="truncate">
            {event.city}, {event.country}
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            <Heart className="h-3 w-3 text-wine-400" />
            Good Movies • Great Company
          </span>
        </div>
      </div>
    </div>
  );
}

/** Convenience preview with placeholder guest details. */
export function DigitalTicketPreview({
  event,
  className,
}: {
  event: EventDetails;
  className?: string;
}) {
  return (
    <DigitalTicket
      event={event}
      sample
      statusLabel="Preview"
      booking={{
        customerName: 'Your Name',
        ticketNumber: 'HOC-2019-XXXX-XXX',
        quantity: 2,
        totalETB: event.priceETB * 2,
        qrPayload: 'harar-cinema://ticket/preview',
      }}
      className={className}
    />
  );
}

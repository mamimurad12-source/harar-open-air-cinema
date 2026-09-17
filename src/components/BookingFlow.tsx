/**
 * Customer booking flow: Seats → Details → Review → Ticket.
 *
 * HONESTY CONTRACT (do not weaken):
 * - `createBooking` only ever creates PENDING bookings (seats reserved).
 * - When a provider is configured, confirming starts a server-side payment
 *   attempt and redirects to the provider's secure checkout. This screen
 *   NEVER claims payment success — the return page shows only what the
 *   server has verified.
 * - When no provider is configured, methods show "coming soon" and the flow
 *   stays reserve-only, exactly as before.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { BookingRecord, CapacitySnapshot, PaymentMethodCode, PaymentMethodInfo } from '../lib/api';
import { CapacityError, getApi } from '../lib/api';
import type { EventDetails } from '../data/event';
import {
  BOOKING_STEPS,
  INITIAL_DRAFT,
  clampQuantity,
  orderTotal,
  validateDraft,
} from '../lib/booking';
import type { BookingDraft, BookingStep, DraftErrors } from '../lib/booking';
import { formatETB, pluralize } from '../lib/format';
import { DigitalTicket } from './DigitalTicket';
import { Reveal, cn } from './ui';

interface BookingFlowProps {
  event: EventDetails;
  capacity: CapacitySnapshot | null;
  onCapacityChange?: () => void;
}

function Stepper({ draft, remaining, setDraft }: {
  draft: BookingDraft;
  remaining: number;
  setDraft: (d: BookingDraft) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-cream-200/60 p-4 ring-1 ring-ink-950/10">
      <div>
        <p className="text-[11px] font-extrabold tracking-[0.18em] text-ink-500 uppercase">Tickets</p>
        <p className="mt-0.5 text-sm font-bold text-ink-700">
          {remaining} {pluralize(remaining, 'seat')} available
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="One fewer ticket"
          disabled={draft.quantity <= 1}
          onClick={() => setDraft({ ...draft, quantity: draft.quantity - 1 })}
          className="grid h-11 w-11 place-items-center rounded-full bg-ink-950 text-xl font-black text-cream-50 transition-all hover:bg-wine-700 active:scale-90 disabled:cursor-not-allowed disabled:opacity-25"
        >
          −
        </button>
        <span className="w-10 text-center font-display text-3xl font-black" aria-live="polite">
          {draft.quantity}
        </span>
        <button
          type="button"
          aria-label="One more ticket"
          disabled={draft.quantity >= remaining}
          onClick={() => setDraft({ ...draft, quantity: draft.quantity + 1 })}
          className="grid h-11 w-11 place-items-center rounded-full bg-wine-700 text-xl font-black text-cream-50 transition-all hover:bg-wine-600 active:scale-90 disabled:cursor-not-allowed disabled:opacity-25"
        >
          +
        </button>
      </div>
    </div>
  );
}

export function BookingFlow({ event, capacity, onCapacityChange }: BookingFlowProps) {
  const remaining = capacity?.remaining ?? event.capacityTotal;
  const [step, setStep] = useState<BookingStep>('seats');
  const [draft, setDraft] = useState<BookingDraft>(() => ({
    ...INITIAL_DRAFT,
    quantity: clampQuantity(INITIAL_DRAFT.quantity, remaining || event.capacityTotal),
  }));
  const [errors, setErrors] = useState<DraftErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [booking, setBooking] = useState<BookingRecord | null>(null);
  // One key per booking attempt: retries/double-submits can never book twice.
  const idempotencyKey = useRef(crypto.randomUUID());
  // Live method availability from the server (null = still loading).
  const [methods, setMethods] = useState<PaymentMethodInfo[] | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodCode | ''>('');
  const [payPhase, setPayPhase] = useState<'idle' | 'starting-payment' | 'redirecting'>('idle');

  useEffect(() => {
    let live = true;
    getApi()
      .listPaymentMethods()
      .then((loaded) => {
        if (!live) return;
        setMethods(loaded);
        const firstAvailable = loaded.find((m) => m.available);
        if (firstAvailable) setSelectedMethod(firstAvailable.method);
      })
      .catch(() => {
        if (live) setMethods([]);
      });
    return () => {
      live = false;
    };
  }, []);

  const availableMethods = (methods ?? []).filter((m) => m.available);
  const paymentsLive = availableMethods.length > 0;
  const checkoutProvider = availableMethods[0]?.provider ?? 'the payment provider';

  const stepIndex = BOOKING_STEPS.findIndex((s) => s.id === step);
  const total = orderTotal(event.priceETB, draft.quantity);

  const goSeats = () => { setSubmitError(null); setStep('seats'); };
  const goDetails = () => {
    if (draft.quantity < 1 || draft.quantity > remaining) {
      setErrors({ quantity: `Only ${remaining} seats left.` });
      return;
    }
    setErrors({});
    setSubmitError(null);
    setStep('details');
  };
  const goReview = () => {
    const next = validateDraft(draft, remaining);
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSubmitError(null);
    setStep('review');
  };

  const confirmBooking = async () => {
    setSubmitting(true);
    setSubmitError(null);
    setPayPhase('idle');
    try {
      const record = await getApi().createBooking({
        eventId: event.id,
        customerName: draft.customerName.trim(),
        phone: draft.phone.trim(),
        quantity: draft.quantity,
        idempotencyKey: idempotencyKey.current,
      });
      if (paymentsLive) {
        if (!selectedMethod) {
          setSubmitError('Choose how you would like to pay.');
          setSubmitting(false);
          return;
        }
        // Seats are reserved; now start the server-side payment attempt.
        setPayPhase('starting-payment');
        try {
          const initiated = await getApi().initiatePayment(record.id, selectedMethod);
          if (!initiated.checkoutUrl) {
            throw new Error('the provider did not return a checkout link');
          }
          try {
            sessionStorage.setItem(
              'hoc.pendingPayment',
              JSON.stringify({ reference: record.id, phone: draft.phone.trim() }),
            );
          } catch {
            /* private mode — the return page offers a manual lookup */
          }
          setPayPhase('redirecting');
          onCapacityChange?.();
          window.location.assign(initiated.checkoutUrl);
          return; // navigation away — keep the spinner until we leave
        } catch (payErr) {
          setPayPhase('idle');
          const reason = payErr instanceof Error ? payErr.message : 'please try again';
          setSubmitError(
            `Seats reserved as ${record.ticketNumber} — payment could not start (${reason}). Tap the button again to retry payment.`,
          );
          setSubmitting(false);
          return;
        }
      }
      setBooking(record);
      setStep('ticket');
      onCapacityChange?.();
    } catch (err) {
      if (err instanceof CapacityError) {
        setSubmitError(err.message);
        setDraft((d) => ({ ...d, quantity: clampQuantity(d.quantity, err.remaining) }));
        onCapacityChange?.();
      } else {
        setSubmitError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (capacity?.isSoldOut && step !== 'ticket') {
    return (
      <div className="rounded-3xl bg-cream-50 p-8 text-center ring-1 ring-ink-950/10">
        <p className="font-display text-3xl font-black">Sold out ♥</p>
        <p className="mt-2 text-sm font-semibold text-ink-500">
          All {event.capacityTotal} seats for this screening are claimed. Follow us for the next
          open-air night in Harar.
        </p>
        <Link to="/" className="mt-5 inline-block font-bold text-wine-700 underline underline-offset-4">
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Progress */}
      <ol className="flex items-center gap-1.5 sm:gap-2" aria-label="Booking progress">
        {BOOKING_STEPS.map((s, i) => {
          const done = i < stepIndex;
          const active = i === stepIndex;
          return (
            <li key={s.id} className="flex flex-1 items-center gap-1.5 sm:gap-2">
              <span
                className={cn(
                  'grid h-8 w-8 shrink-0 place-items-center rounded-full text-[13px] font-black transition-colors',
                  done && 'bg-emerald-700 text-cream-50',
                  active && 'bg-wine-700 text-cream-50',
                  !done && !active && 'bg-ink-950/10 text-ink-500',
                )}
              >
                {done ? '✓' : i + 1}
              </span>
              <span
                className={cn(
                  'hidden text-[13px] font-extrabold sm:block',
                  active ? 'text-ink-950' : 'text-ink-400',
                )}
              >
                {s.label}
              </span>
              {i < BOOKING_STEPS.length - 1 && (
                <span className={cn('h-0.5 min-w-2 flex-1 rounded-full', done ? 'bg-emerald-700' : 'bg-ink-950/10')} />
              )}
            </li>
          );
        })}
      </ol>

      <div className="mt-6 rounded-3xl bg-cream-50 p-5 ring-1 ring-ink-950/10 sm:p-8">
        {submitError && (
          <p role="alert" className="mb-4 rounded-2xl bg-wine-700/10 px-4 py-3 text-sm font-bold text-wine-700 ring-1 ring-wine-700/25">
            {submitError}
          </p>
        )}

        {/* STEP 1 — seats */}
        {step === 'seats' && (
          <Reveal>
            <h3 className="font-display text-2xl font-black">How many seats?</h3>
            <p className="mt-1 text-sm font-semibold text-ink-500">
              {formatETB(event.priceETB)} per ticket • free snack included
            </p>
            <div className="mt-5">
              <Stepper draft={draft} remaining={remaining} setDraft={setDraft} />
              {errors.quantity && <p className="mt-2 text-sm font-bold text-wine-700">{errors.quantity}</p>}
            </div>
            <div className="mt-5 flex items-center justify-between rounded-2xl bg-ink-950 px-5 py-4 text-cream-50">
              <span className="text-sm font-bold text-cream-100/70">Total</span>
              <span className="font-display text-2xl font-black text-gold-300">{formatETB(total)}</span>
            </div>
            <button
              type="button"
              onClick={goDetails}
              className="mt-5 w-full rounded-full bg-wine-700 px-7 py-4 text-[15px] font-extrabold tracking-wide text-cream-50 transition-all hover:bg-wine-600 active:scale-[0.99]"
            >
              Continue →
            </button>
          </Reveal>
        )}

        {/* STEP 2 — details */}
        {step === 'details' && (
          <Reveal>
            <h3 className="font-display text-2xl font-black">Your details</h3>
            <p className="mt-1 text-sm font-semibold text-ink-500">
              No account needed — just a name and phone number.
            </p>
            <div className="mt-5 space-y-4">
              <div>
                <label htmlFor="bk-name" className="mb-1.5 block text-[13px] font-extrabold text-ink-800">
                  Full name
                </label>
                <input
                  id="bk-name"
                  type="text"
                  autoComplete="name"
                  placeholder="e.g. Hanna Girma"
                  value={draft.customerName}
                  onChange={(e) => setDraft({ ...draft, customerName: e.target.value })}
                  className={cn(
                    'w-full rounded-2xl border-2 bg-cream-100 px-4 py-3.5 text-[15px] font-semibold text-ink-950 placeholder:font-medium placeholder:text-ink-400 focus:outline-none',
                    errors.customerName ? 'border-wine-600' : 'border-transparent focus:border-wine-600/50',
                  )}
                />
                {errors.customerName && <p className="mt-1.5 text-[13px] font-bold text-wine-700">{errors.customerName}</p>}
              </div>
              <div>
                <label htmlFor="bk-phone" className="mb-1.5 block text-[13px] font-extrabold text-ink-800">
                  Mobile number
                </label>
                <input
                  id="bk-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="e.g. 0911 12 34 56"
                  value={draft.phone}
                  onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                  className={cn(
                    'w-full rounded-2xl border-2 bg-cream-100 px-4 py-3.5 text-[15px] font-semibold text-ink-950 placeholder:font-medium placeholder:text-ink-400 focus:outline-none',
                    errors.phone ? 'border-wine-600' : 'border-transparent focus:border-wine-600/50',
                  )}
                />
                {errors.phone ? (
                  <p className="mt-1.5 text-[13px] font-bold text-wine-700">{errors.phone}</p>
                ) : (
                  <p className="mt-1.5 text-xs font-semibold text-ink-400">
                    Ethiopian mobile — 09… / 07… or +251…
                  </p>
                )}
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={goSeats}
                className="rounded-full px-6 py-4 text-sm font-extrabold text-ink-700 ring-2 ring-ink-950/15 transition-all hover:ring-ink-950/30 active:scale-[0.99]"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={goReview}
                className="flex-1 rounded-full bg-wine-700 px-7 py-4 text-[15px] font-extrabold tracking-wide text-cream-50 transition-all hover:bg-wine-600 active:scale-[0.99]"
              >
                Review booking →
              </button>
            </div>
          </Reveal>
        )}

        {/* STEP 3 — review */}
        {step === 'review' && (
          <Reveal>
            <h3 className="font-display text-2xl font-black">Review & confirm</h3>
            <p className="mt-1 text-sm font-semibold text-ink-500">
              Check everything before reserving your seats.
            </p>
            <dl className="mt-5 overflow-hidden rounded-2xl bg-cream-100 ring-1 ring-ink-950/10">
              {[
                ['Event', event.name],
                ['Date', `${event.dateLabel} (${event.dateNote})`],
                ['Time', `${event.timeLabel} (${event.timeNote})`],
                ['Venue', `${event.venue}, ${event.city}`],
                ['Guest', draft.customerName.trim()],
                ['Phone', draft.phone.trim()],
                ['Tickets', `${draft.quantity} × ${formatETB(event.priceETB)}`],
                ['Snack', 'Free — included'],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-4 border-b border-ink-950/8 px-4 py-3 text-sm last:border-0">
                  <dt className="font-bold text-ink-500">{k}</dt>
                  <dd className="text-right font-extrabold text-ink-950">{v}</dd>
                </div>
              ))}
              <div className="flex items-center justify-between bg-ink-950 px-4 py-3.5 text-cream-50">
                <dt className="text-sm font-bold text-cream-100/70">Total due</dt>
                <dd className="font-display text-xl font-black text-gold-300">{formatETB(total)}</dd>
              </div>
            </dl>

            {paymentsLive ? (
              <div className="mt-5">
                <p className="text-[13px] font-extrabold tracking-wide text-ink-800 uppercase">
                  How would you like to pay?
                </p>
                <div role="radiogroup" aria-label="Payment method" className="mt-2.5 grid gap-2 sm:grid-cols-2">
                  {(methods ?? []).map((m) => {
                    const selected = selectedMethod === m.method;
                    return (
                      <label
                        key={m.method}
                        className={cn(
                          'flex cursor-pointer items-center justify-between gap-3 rounded-2xl border-2 px-4 py-3.5 transition-all',
                          selected
                            ? 'border-wine-700 bg-wine-700/[0.06]'
                            : 'border-ink-950/10 bg-cream-100 hover:border-ink-950/25',
                          !m.available && 'cursor-not-allowed opacity-60 hover:border-ink-950/10',
                        )}
                      >
                        <span className="flex items-center gap-3">
                          <input
                            type="radio"
                            name="pay-method"
                            value={m.method}
                            disabled={!m.available || submitting}
                            checked={selected}
                            onChange={() => setSelectedMethod(m.method)}
                            className="h-4 w-4 accent-wine-700"
                          />
                          <span className="text-[15px] font-extrabold text-ink-950">{m.label}</span>
                        </span>
                        {m.available ? (
                          <span className="text-xs font-bold text-ink-400">via {m.provider}</span>
                        ) : (
                          <span className="rounded-full bg-gold-500/15 px-2.5 py-1 text-[10px] font-extrabold tracking-wider text-gold-600 uppercase ring-1 ring-gold-500/40">
                            Coming soon
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
                <p className="mt-3 rounded-2xl bg-cream-100 px-4 py-3 text-[13px] leading-relaxed font-semibold text-ink-700 ring-1 ring-ink-950/10">
                  You will be redirected to {checkoutProvider}&rsquo;s secure checkout to
                  pay <strong>{formatETB(total)}</strong>. Your seats stay reserved while
                  you pay, and your QR ticket activates automatically after verified payment.
                </p>
              </div>
            ) : (
              /* Honest payment notice — never faked */
              <div className="mt-4 rounded-2xl border-2 border-dashed border-gold-500/60 bg-gold-500/10 p-4">
                <p className="flex items-center gap-2 text-sm font-extrabold text-gold-600">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.01" /></svg>
                  Online payment — coming soon
                </p>
                <p className="mt-1.5 text-[13px] leading-relaxed font-semibold text-ink-700">
                  Confirming now <strong>reserves your seats as pending</strong> — no money moves
                  today. How and when to pay will be announced by the organizers, and your QR ticket
                  activates after verified payment.
                </p>
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setStep('details')}
                disabled={submitting}
                className="rounded-full px-6 py-4 text-sm font-extrabold text-ink-700 ring-2 ring-ink-950/15 transition-all hover:ring-ink-950/30 disabled:opacity-40"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={confirmBooking}
                disabled={submitting}
                className="flex-1 rounded-full bg-wine-700 px-7 py-4 text-[15px] font-extrabold tracking-wide text-cream-50 transition-all hover:bg-wine-600 active:scale-[0.99] disabled:cursor-wait disabled:opacity-70"
              >
                {submitting
                  ? payPhase === 'redirecting'
                    ? 'Opening secure checkout…'
                    : paymentsLive
                      ? 'Starting payment…'
                      : 'Reserving…'
                  : paymentsLive
                    ? `Pay ${formatETB(total)} →`
                    : `Reserve ${draft.quantity} ${pluralize(draft.quantity, 'seat')} →`}
              </button>
            </div>
          </Reveal>
        )}

        {/* STEP 4 — ticket preview (pending payment) */}
        {step === 'ticket' && booking && (
          <Reveal>
            <div className="text-center">
              <span className="inline-grid h-14 w-14 place-items-center rounded-full bg-emerald-700/10 text-emerald-700 ring-1 ring-emerald-700/25">
                <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
              </span>
              <h3 className="mt-3 font-display text-2xl font-black">Seats reserved ♥</h3>
              <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed font-semibold text-ink-500">
                Booking <span className="font-mono font-extrabold text-ink-800">{booking.ticketNumber}</span>{' '}
                is saved as <strong className="text-gold-600">pending payment</strong>. Your QR ticket below
                is a preview — it becomes valid once payment is verified.
              </p>
            </div>
            <div className="mt-6">
              <DigitalTicket event={event} booking={booking} sample statusLabel="Pending payment" />
            </div>
            <div className="mt-5 rounded-2xl bg-cream-100 p-4 ring-1 ring-ink-950/10">
              <p className="text-[13px] leading-relaxed font-semibold text-ink-700">
                <strong>What happens next:</strong> the organizers will announce how to complete
                payment. After verified payment you will receive your final digital ticket with a
                scannable QR code. Please keep your ticket number ready.
              </p>
            </div>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/"
                className="flex-1 rounded-full bg-ink-950 px-7 py-3.5 text-center text-sm font-extrabold tracking-wide text-cream-50 transition-all hover:bg-ink-800"
              >
                Back to home
              </Link>
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 rounded-full px-7 py-3.5 text-sm font-extrabold text-ink-800 ring-2 ring-ink-950/15 transition-all hover:ring-ink-950/30"
              >
                Print / save preview
              </button>
            </div>
          </Reveal>
        )}
      </div>
    </div>
  );
}

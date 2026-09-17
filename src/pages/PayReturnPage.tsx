/**
 * Post-payment return page (`/pay/return`).
 *
 * HONESTY CONTRACT: arriving here proves NOTHING — the customer may have
 * paid, cancelled, or simply opened the link. Everything shown comes from the
 * server's verified status, polled + re-checked via server-side verification.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { EventDetails } from '../data/event';
import type { PaymentMethodCode, PaymentStatusView } from '../lib/api';
import { getApi } from '../lib/api';
import { formatETB } from '../lib/format';
import { qrPayloadForToken } from '../lib/tickets';
import { DigitalTicket } from '../components/DigitalTicket';
import { Reveal, StatusPill } from '../components/ui';

interface PendingCreds {
  reference: string;
  phone: string;
}

function readPendingPayment(): PendingCreds | null {
  try {
    const raw = sessionStorage.getItem('hoc.pendingPayment');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingCreds>;
    if (typeof parsed.reference === 'string' && typeof parsed.phone === 'string') {
      return { reference: parsed.reference, phone: parsed.phone };
    }
    return null;
  } catch {
    return null;
  }
}

function clearPendingPayment(): void {
  try {
    sessionStorage.removeItem('hoc.pendingPayment');
  } catch {
    /* ignore */
  }
}

const VERIFICATION_NOTES: Record<string, string> = {
  completed: 'Payment verified by the provider ✓',
  'already-paid': 'Already verified ✓',
  'still-pending': 'The provider has not confirmed yet — still waiting.',
  failed: 'The provider reported that this payment failed.',
  'not-payable': 'This payment can no longer be completed.',
  'booking-invalid': 'This booking is no longer payable.',
};

function ManualLookup({ onFound }: { onFound: (creds: PendingCreds) => void }) {
  const [reference, setReference] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const submit = async () => {
    if (!reference.trim() || !phone.trim()) {
      setError('Enter your booking reference and phone number.');
      return;
    }
    setChecking(true);
    setError(null);
    try {
      await getApi().getPaymentStatus(reference.trim(), phone.trim());
      onFound({ reference: reference.trim(), phone: phone.trim() });
    } catch {
      setError('Booking not found. Check the reference and phone number and try again.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="rounded-3xl bg-cream-50 p-6 ring-1 ring-ink-950/10 sm:p-8">
      <h2 className="font-display text-2xl font-black">Find your booking</h2>
      <p className="mt-1 text-sm font-semibold text-ink-500">
        We couldn&apos;t pick up where you left off — enter your details to check payment status.
      </p>
      {error && (
        <p role="alert" className="mt-4 rounded-2xl bg-wine-700/10 px-4 py-3 text-sm font-bold text-wine-700 ring-1 ring-wine-700/25">
          {error}
        </p>
      )}
      <div className="mt-5 space-y-4">
        <div>
          <label htmlFor="pr-ref" className="mb-1.5 block text-[13px] font-extrabold text-ink-800">
            Booking reference
          </label>
          <input
            id="pr-ref"
            type="text"
            autoComplete="off"
            placeholder="e.g. HOC-ABC123"
            value={reference}
            onChange={(e) => setReference(e.target.value.toUpperCase())}
            className="w-full rounded-2xl border-2 border-transparent bg-cream-100 px-4 py-3.5 font-mono text-[15px] font-bold tracking-wide text-ink-950 placeholder:font-sans placeholder:font-medium placeholder:text-ink-400 focus:border-wine-600/50 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="pr-phone" className="mb-1.5 block text-[13px] font-extrabold text-ink-800">
            Phone number used for booking
          </label>
          <input
            id="pr-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="e.g. 0911 12 34 56"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-2xl border-2 border-transparent bg-cream-100 px-4 py-3.5 text-[15px] font-semibold text-ink-950 placeholder:font-medium placeholder:text-ink-400 focus:border-wine-600/50 focus:outline-none"
          />
        </div>
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={checking}
        className="mt-6 w-full rounded-full bg-wine-700 px-7 py-4 text-[15px] font-extrabold tracking-wide text-cream-50 transition-all hover:bg-wine-600 active:scale-[0.99] disabled:cursor-wait disabled:opacity-70"
      >
        {checking ? 'Checking…' : 'Check payment status →'}
      </button>
    </div>
  );
}

export function PayReturnPage() {
  const [params] = useSearchParams();
  const provider = params.get('provider');
  const [creds, setCreds] = useState<PendingCreds | null>(() => readPendingPayment());
  const [view, setView] = useState<PaymentStatusView | null>(null);
  const [event, setEvent] = useState<EventDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [verification, setVerification] = useState<string | null>(null);
  const eventLoadedFor = useRef<string | null>(null);

  // Initial load + polling while the outcome is still open.
  useEffect(() => {
    if (!creds) {
      setLoading(false);
      return;
    }
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let polls = 0;
    const load = async () => {
      try {
        const status = await getApi().getPaymentStatus(creds.reference, creds.phone);
        if (!live) return;
        setView(status);
        setActionError(null);
        if (status.payment?.status === 'PAID') clearPendingPayment();
        if (eventLoadedFor.current !== status.booking.eventId) {
          eventLoadedFor.current = status.booking.eventId;
          getApi().getEvent(status.booking.eventId).then(setEvent).catch(() => {});
        }
        const settled =
          status.payment?.status !== 'PENDING' || status.booking.status !== 'pending_payment';
        if (!settled && polls < 40) {
          polls += 1;
          timer = setTimeout(load, 4000);
        }
      } catch {
        if (live) {
          setActionError('Could not reach the server. Check your connection and try again.');
        }
      } finally {
        if (live) setLoading(false);
      }
    };
    load();
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [creds]);

  const checkAgain = async () => {
    if (!creds || checking) return;
    setChecking(true);
    setActionError(null);
    try {
      const result = await getApi().verifyPaymentNow(creds.reference, creds.phone);
      setView({ booking: result.booking, payment: result.payment });
      setVerification(result.verification);
      if (result.payment?.status === 'PAID') clearPendingPayment();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Verification failed. Try again.');
    } finally {
      setChecking(false);
    }
  };

  const retryPayment = async () => {
    if (!creds || !view?.payment || checking) return;
    setChecking(true);
    setActionError(null);
    try {
      const resumed = await getApi().initiatePayment(
        creds.reference,
        view.payment.paymentMethod as PaymentMethodCode,
      );
      if (!resumed.checkoutUrl) throw new Error('The provider did not return a checkout link.');
      try {
        sessionStorage.setItem('hoc.pendingPayment', JSON.stringify(creds));
      } catch {
        /* ignore */
      }
      window.location.assign(resumed.checkoutUrl);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not restart payment. Try again.');
      setChecking(false);
    }
  };

  const payment = view?.payment ?? null;
  const booking = view?.booking ?? null;
  const isPaid = payment?.status === 'PAID';
  const isFailed = payment?.status === 'FAILED';
  const isExpired = payment?.status === 'EXPIRED' || booking?.statusRaw === 'EXPIRED';
  const isPending = !!booking && !isPaid && !isFailed && !isExpired;
  const expiryLabel = booking?.expiresAt
    ? new Date(booking.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <Reveal>
        <p className="text-center text-[11px] font-extrabold tracking-[0.24em] text-wine-700 uppercase">
          {provider ? `Returned from ${provider}` : 'Payment status'}
        </p>
        <h1 className="mt-2 text-center font-display text-4xl font-black tracking-tight text-ink-950 sm:text-5xl">
          {isPaid ? 'You’re in! ♥' : 'Payment status'}
        </h1>
      </Reveal>

      <div className="mt-8">
        {loading && (
          <div className="rounded-3xl bg-cream-50 p-10 text-center ring-1 ring-ink-950/10">
            <p className="animate-pulse font-display text-2xl font-black">Checking with the provider…</p>
            <p className="mt-2 text-sm font-semibold text-ink-500">
              Hold on — we&apos;re confirming your payment securely.
            </p>
          </div>
        )}

        {!loading && !creds && !view && <ManualLookup onFound={setCreds} />}

        {!loading && creds && actionError && !view && (
          <div className="rounded-3xl bg-cream-50 p-6 text-center ring-1 ring-ink-950/10 sm:p-8">
            <p role="alert" className="text-sm font-bold text-wine-700">{actionError}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-full bg-ink-950 px-7 py-3 text-sm font-extrabold text-cream-50"
            >
              Try again
            </button>
          </div>
        )}

        {booking && (
          <Reveal>
            <div className="rounded-3xl bg-cream-50 p-6 ring-1 ring-ink-950/10 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-extrabold tracking-[0.18em] text-ink-500 uppercase">
                    Booking {booking.ticketNumber}
                  </p>
                  <p className="mt-1 font-display text-2xl font-black">
                    {formatETB(booking.totalETB)}
                    <span className="ml-2 align-middle text-sm font-bold text-ink-400">
                      {booking.quantity} {booking.quantity === 1 ? 'ticket' : 'tickets'}
                    </span>
                  </p>
                </div>
                {isPaid && <StatusPill tone="success">Paid ✓</StatusPill>}
                {isPending && <StatusPill tone="warning">Awaiting payment</StatusPill>}
                {isFailed && <StatusPill tone="danger">Payment failed</StatusPill>}
                {isExpired && <StatusPill tone="muted">Expired</StatusPill>}
              </div>

              {actionError && (
                <p role="alert" className="mt-4 rounded-2xl bg-wine-700/10 px-4 py-3 text-sm font-bold text-wine-700 ring-1 ring-wine-700/25">
                  {actionError}
                </p>
              )}
              {verification && VERIFICATION_NOTES[verification] && (
                <p className="mt-4 rounded-2xl bg-cream-100 px-4 py-3 text-sm font-bold text-ink-700 ring-1 ring-ink-950/10">
                  {VERIFICATION_NOTES[verification]}
                </p>
              )}

              {isPending && (
                <div className="mt-4 rounded-2xl border-2 border-dashed border-gold-500/60 bg-gold-500/10 p-4">
                  <p className="text-sm leading-relaxed font-semibold text-ink-700">
                    {payment
                      ? 'Waiting for the provider to confirm. This page checks automatically — if you already paid, give it a moment, then tap “Check again”.'
                      : 'No payment has been started for this booking yet.'}
                    {expiryLabel && (
                      <> Your seats are held until <strong>{expiryLabel}</strong>.</>
                    )}
                  </p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={checkAgain}
                      disabled={checking}
                      className="flex-1 rounded-full bg-wine-700 px-6 py-3 text-sm font-extrabold text-cream-50 transition-all hover:bg-wine-600 disabled:cursor-wait disabled:opacity-70"
                    >
                      {checking ? 'Checking…' : 'I’ve paid — check again'}
                    </button>
                    {payment?.status === 'PENDING' && (
                      <button
                        type="button"
                        onClick={retryPayment}
                        disabled={checking}
                        className="flex-1 rounded-full px-6 py-3 text-sm font-extrabold text-ink-800 ring-2 ring-ink-950/15 transition-all hover:ring-ink-950/30 disabled:opacity-50"
                      >
                        {checking ? 'Working…' : 'Back to checkout'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {isFailed && (
                <div className="mt-4 rounded-2xl bg-wine-700/10 p-4 ring-1 ring-wine-700/25">
                  <p className="text-sm leading-relaxed font-semibold text-ink-700">
                    This payment attempt didn&apos;t go through
                    {payment?.failureReason ? `: ${payment.failureReason}` : '.'} No money was
                    taken by us — you can safely try again while your seats are held.
                  </p>
                  {booking.statusRaw === 'PENDING' && (
                    <button
                      type="button"
                      onClick={retryPayment}
                      disabled={checking}
                      className="mt-3 w-full rounded-full bg-wine-700 px-6 py-3 text-sm font-extrabold text-cream-50 transition-all hover:bg-wine-600 disabled:cursor-wait disabled:opacity-70"
                    >
                      {checking ? 'Starting…' : 'Try payment again →'}
                    </button>
                  )}
                </div>
              )}

              {isExpired && (
                <div className="mt-4 rounded-2xl bg-cream-100 p-4 ring-1 ring-ink-950/10">
                  <p className="text-sm leading-relaxed font-semibold text-ink-700">
                    This booking&apos;s payment window has passed and the seats were released.
                    Please make a fresh booking to try again.
                  </p>
                  <Link
                    to="/book"
                    className="mt-3 inline-block w-full rounded-full bg-ink-950 px-6 py-3 text-center text-sm font-extrabold text-cream-50"
                  >
                    Book again →
                  </Link>
                </div>
              )}
            </div>
          </Reveal>
        )}

        {isPaid && booking && (
          <div className="mt-8 space-y-8">
            <Reveal>
              <p className="text-center text-sm leading-relaxed font-semibold text-ink-500">
                Payment verified — show{' '}
                {booking.quantity === 1 ? 'this ticket' : 'these tickets'} at the entrance.
                {payment?.providerMethod && (
                  <> Paid via <strong>{payment.providerMethod}</strong>.</>
                )}
              </p>
            </Reveal>
            {event &&
              (booking.tickets && booking.tickets.length > 0
                ? booking.tickets.map((t) => (
                    <DigitalTicket
                      key={t.ticketNumber}
                      event={event}
                      qrReal
                      statusLabel="Paid ✓"
                      booking={{
                        customerName: booking.customerName,
                        ticketNumber: t.ticketNumber,
                        quantity: 1,
                        totalETB: event.priceETB,
                        qrPayload: t.qrToken ? qrPayloadForToken(t.qrToken) : booking.qrPayload,
                      }}
                    />
                  ))
                : (
                    <DigitalTicket event={event} qrReal statusLabel="Paid ✓" booking={booking} />
                  ))}
          </div>
        )}
      </div>
    </main>
  );
}

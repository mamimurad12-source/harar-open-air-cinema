/**
 * Gate-side validation against the live database. Outcomes: VALID,
 * ALREADY_USED, INVALID, CANCELLED. A validated ticket flips ACTIVE → USED
 * and can never pass again.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { TicketValidation } from '../../lib/api';
import { ApiRequestError, getApi } from '../../lib/api';

type Tone = 'valid' | 'used' | 'invalid' | 'cancelled';

const TONE_STYLES: Record<Tone, string> = {
  valid: 'bg-emerald-500/15 ring-emerald-400/40',
  used: 'bg-gold-500/15 ring-gold-400/40',
  invalid: 'bg-wine-500/15 ring-wine-400/40',
  cancelled: 'bg-wine-500/15 ring-wine-400/40',
};

function toneFor(outcome: TicketValidation['outcome']): Tone {
  switch (outcome) {
    case 'VALID':
      return 'valid';
    case 'ALREADY_USED':
      return 'used';
    case 'CANCELLED':
      return 'cancelled';
    default:
      return 'invalid';
  }
}

export function TicketsPage() {
  const [code, setCode] = useState('');
  const [result, setResult] = useState<TicketValidation | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  const check = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || checking) return;
    setChecking(true);
    setError(null);
    setSessionExpired(false);
    try {
      setResult(await getApi().validateTicket(trimmed));
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) {
        setSessionExpired(true);
        setResult(null);
      } else {
        setError(err instanceof Error ? err.message : 'Validation failed. Try again.');
      }
    } finally {
      setChecking(false);
    }
  };

  const reset = () => {
    setCode('');
    setResult(null);
    setError(null);
  };

  return (
    <div className="space-y-5">
      <div className="rounded-3xl bg-ink-950 p-5 text-cream-50 sm:p-6">
        <h2 className="font-display text-lg font-black">Validate a ticket</h2>
        <p className="mt-1 text-[13px] font-semibold text-cream-100/60">
          Type the ticket code, or paste the QR payload from your scanner app.
        </p>
        <form
          className="mt-4 flex flex-col gap-2.5 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void check(code);
          }}
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="HOC-2019-… or harar-cinema://ticket/…"
            autoComplete="off"
            spellCheck={false}
            className="flex-1 rounded-2xl bg-cream-50 px-4 py-3.5 font-mono text-[14px] font-bold tracking-tight text-ink-950 placeholder:font-sans placeholder:font-medium placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-gold-400"
          />
          <button
            type="submit"
            disabled={checking || !code.trim()}
            className="rounded-2xl bg-wine-600 px-8 py-3.5 text-sm font-extrabold tracking-wide transition-all hover:bg-wine-500 disabled:opacity-50 sm:rounded-full"
          >
            {checking ? 'Checking…' : 'Validate ✓'}
          </button>
        </form>

        {sessionExpired && (
          <p role="alert" className="mt-4 rounded-2xl bg-gold-500/15 px-4 py-3 text-sm font-bold text-gold-300 ring-1 ring-gold-400/40">
            Session expired.{' '}
            <Link to="/admin/login" className="underline underline-offset-2">
              Sign in again
            </Link>
            .
          </p>
        )}
        {error && (
          <p role="alert" className="mt-4 rounded-2xl bg-wine-500/15 px-4 py-3 text-sm font-bold text-red-200 ring-1 ring-wine-400/40">
            {error}
          </p>
        )}

        {result && (
          <div role="status" className={`mt-4 rounded-2xl p-4 ring-1 sm:p-5 ${TONE_STYLES[toneFor(result.outcome)]}`}>
            <p className="text-[11px] font-extrabold tracking-[0.24em] text-cream-100/60 uppercase">
              {result.outcome === 'VALID' && '✓ Valid ticket'}
              {result.outcome === 'ALREADY_USED' && '◷ Already used'}
              {result.outcome === 'INVALID' && '✕ Invalid ticket'}
              {result.outcome === 'CANCELLED' && '✕ Cancelled ticket'}
            </p>
            <p className="mt-1 font-display text-xl leading-snug font-black text-cream-50">
              {result.outcome === 'VALID' && result.paymentPending
                ? 'Genuine ticket — payment not yet verified.'
                : result.message}
            </p>
            {(result.ticketNumber || result.customerName) && (
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm font-semibold text-cream-100/85 sm:grid-cols-4">
                {result.customerName && (
                  <span>
                    <dt className="sr-only">Guest</dt>
                    <dd className="font-extrabold text-cream-50">{result.customerName}</dd>
                  </span>
                )}
                {result.quantity !== null && (
                  <span>
                    Seats: <strong className="text-cream-50">×{result.quantity}</strong>
                  </span>
                )}
                {result.ticketNumber && (
                  <span className="font-mono text-xs">{result.ticketNumber}</span>
                )}
                {result.paymentStatus && (
                  <span>
                    Payment:{' '}
                    <strong className={result.paymentStatus === 'PAID' ? 'text-emerald-300' : 'text-gold-300'}>
                      {result.paymentStatus}
                    </strong>
                  </span>
                )}
              </dl>
            )}
            {result.validatedAt && result.outcome === 'ALREADY_USED' && (
              <p className="mt-2 text-xs font-bold text-cream-100/70">
                First validated: {new Date(result.validatedAt).toLocaleString()}
              </p>
            )}
            <button
              type="button"
              onClick={reset}
              className="mt-4 rounded-full bg-cream-50/10 px-6 py-2.5 text-[13px] font-extrabold text-cream-50 ring-1 ring-cream-50/20 transition-colors hover:bg-cream-50/20"
            >
              Scan next ticket →
            </button>
          </div>
        )}
      </div>

      <div className="rounded-3xl bg-cream-50 p-5 ring-1 ring-ink-950/10 sm:p-6">
        <h2 className="font-display text-lg font-black">How gate validation works</h2>
        <ul className="mt-3 space-y-2 text-[13px] leading-relaxed font-semibold text-ink-600">
          <li>• Each check hits the live database — screenshots of old tickets can&rsquo;t pass twice.</li>
          <li>• A ticket flips <strong>ACTIVE → USED</strong> the moment it validates.</li>
          <li>• Until online payment launches, genuine tickets show <strong>payment not yet verified</strong> — admit per the organizers&rsquo; gate policy.</li>
          <li>• <strong>Already used</strong> and <strong>cancelled</strong> tickets must not be admitted.</li>
        </ul>
      </div>
    </div>
  );
}

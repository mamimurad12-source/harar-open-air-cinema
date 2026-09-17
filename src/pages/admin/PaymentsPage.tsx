/**
 * Organizer payment ledger — every attempt with provider references.
 * Read-only and secret-free: organizers never mark payments by hand; rows
 * flip to PAID only through verified provider confirmation.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PaymentLedgerItem } from '../../lib/api';
import { PAYMENT_METHOD_LABELS, getApi } from '../../lib/api';
import { formatETB } from '../../lib/format';
import { StatusPill } from '../../components/ui';

function methodLabel(method: string): string {
  return (
    (PAYMENT_METHOD_LABELS as Record<string, string>)[method] ?? (method === '' ? '—' : method)
  );
}

function statusTone(status: string): 'success' | 'warning' | 'muted' | 'danger' {
  switch (status) {
    case 'PAID':
      return 'success';
    case 'PENDING':
      return 'warning';
    case 'FAILED':
      return 'danger';
    default:
      return 'muted';
  }
}

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

export function PaymentsPage() {
  const [items, setItems] = useState<PaymentLedgerItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getApi()
      .listPayments()
      .then(setItems)
      .catch((err: unknown) => {
        const status = (err as { status?: number })?.status;
        setError(
          status === 401
            ? 'Your admin session expired. Please log in again.'
            : 'Could not load the payment ledger. Try again.',
        );
      });
  }, []);

  const paid = (items ?? []).filter((i) => i.status === 'PAID');
  const pending = (items ?? []).filter((i) => i.status === 'PENDING');
  const failed = (items ?? []).filter((i) => i.status === 'FAILED');
  const paidTotal = paid.reduce((s, i) => s + i.amount, 0);

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-3xl bg-wine-700/10 p-5 ring-1 ring-wine-700/25">
          <p className="text-sm font-bold text-wine-700">{error}</p>
          <Link to="/admin/login" className="mt-2 inline-block text-sm font-extrabold text-wine-700 underline underline-offset-4">
            Go to login →
          </Link>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-3xl bg-cream-50 p-5 ring-1 ring-ink-950/10">
          <p className="text-[11px] font-extrabold tracking-[0.16em] text-ink-500 uppercase">Verified paid</p>
          <p className="mt-1.5 font-display text-3xl font-black text-emerald-700">{formatETB(paidTotal)}</p>
          <p className="mt-0.5 text-xs font-bold text-ink-400">{paid.length} payments</p>
        </div>
        <div className="rounded-3xl bg-cream-50 p-5 ring-1 ring-ink-950/10">
          <p className="text-[11px] font-extrabold tracking-[0.16em] text-ink-500 uppercase">Awaiting confirmation</p>
          <p className="mt-1.5 font-display text-3xl font-black text-gold-600">{pending.length}</p>
          <p className="mt-0.5 text-xs font-bold text-ink-400">open attempts</p>
        </div>
        <div className="rounded-3xl bg-cream-50 p-5 ring-1 ring-ink-950/10">
          <p className="text-[11px] font-extrabold tracking-[0.16em] text-ink-500 uppercase">Failed attempts</p>
          <p className="mt-1.5 font-display text-3xl font-black text-wine-700">{failed.length}</p>
          <p className="mt-0.5 text-xs font-bold text-ink-400">safe to retry</p>
        </div>
      </div>

      <div className="rounded-3xl bg-cream-50 p-5 ring-1 ring-ink-950/10 sm:p-6">
        <h2 className="font-display text-lg font-black">Ledger</h2>
        {items === null && !error && (
          <p className="mt-3 animate-pulse text-sm font-bold text-ink-400">Loading payments…</p>
        )}
        {items !== null && items.length === 0 && (
          <p className="mt-3 text-sm font-semibold text-ink-500">
            No payment attempts yet. Attempts appear here the moment a customer starts checkout.
          </p>
        )}
        {items !== null && items.length > 0 && (
          <ul className="mt-3 divide-y divide-ink-950/8">
            {items.map((item) => (
              <li key={item.id} className="py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate font-extrabold text-ink-950">
                      {item.customerName}
                    </span>
                    <span className="block font-mono text-xs text-ink-400">
                      {item.bookingReference} • {methodLabel(item.paymentMethod)}
                      {item.provider ? ` via ${item.provider}` : ''}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="font-extrabold whitespace-nowrap">
                      {formatETB(item.amount)}
                    </span>
                    <StatusPill tone={statusTone(item.status)}>{item.status}</StatusPill>
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 pl-0 font-mono text-[11px] text-ink-400">
                  {item.providerReference && <span>ref {item.providerReference}</span>}
                  {item.providerMethod && <span>{item.providerMethod}</span>}
                  <span>{item.verifiedAt ? `verified ${formatWhen(item.verifiedAt)}` : `started ${formatWhen(item.createdAt)}`}</span>
                </div>
                {item.failureReason && (
                  <p className="mt-1 text-xs font-semibold text-wine-700">{item.failureReason}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

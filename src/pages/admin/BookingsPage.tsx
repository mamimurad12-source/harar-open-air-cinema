/** Live booking list with expandable detail (tickets included). */
import { useEffect, useState } from 'react';
import type { BookingRecord } from '../../lib/api';
import { getApi } from '../../lib/api';
import { formatETB } from '../../lib/format';
import { StatusPill, cn } from '../../components/ui';

export function BookingsPage() {
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'paid'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<BookingRecord | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getApi().listBookings().then(setBookings).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Could not load bookings.');
    });
  }, []);

  const toggle = async (ref: string) => {
    if (expanded === ref) {
      setExpanded(null);
      setDetail(null);
      return;
    }
    setExpanded(ref);
    setDetail(null);
    setLoadingDetail(true);
    try {
      setDetail(await getApi().getBooking(ref));
    } catch (err) {
      setDetail(null);
      setError(err instanceof Error ? err.message : 'Could not load booking detail.');
    } finally {
      setLoadingDetail(false);
    }
  };

  const visible = bookings.filter((b) =>
    filter === 'all' ? true : filter === 'paid' ? b.paymentStatus === 'paid' : b.paymentStatus !== 'paid',
  );

  return (
    <div className="rounded-3xl bg-cream-50 p-5 ring-1 ring-ink-950/10 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-bold text-ink-500">
          {visible.length} {visible.length === 1 ? 'booking' : 'bookings'}
        </p>
        <div className="flex gap-1.5 rounded-full bg-cream-200/70 p-1">
          {(['all', 'pending', 'paid'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-full px-4 py-1.5 text-[13px] font-extrabold capitalize transition-colors ${
                filter === f ? 'bg-ink-950 text-cream-50' : 'text-ink-500 hover:text-ink-950'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-2xl bg-wine-700/10 px-4 py-3 text-sm font-bold text-wine-700 ring-1 ring-wine-700/25">
          {error}
        </p>
      )}

      <ul className="mt-4 space-y-3">
        {visible.map((b) => {
          const open = expanded === b.id;
          return (
            <li key={b.id} className="overflow-hidden rounded-2xl bg-cream-100 ring-1 ring-ink-950/8">
              <button
                type="button"
                onClick={() => void toggle(b.id)}
                aria-expanded={open}
                className="w-full p-4 text-left"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-extrabold text-ink-950">{b.customerName}</span>
                  <span className="flex items-center gap-2">
                    {b.paymentStatus === 'paid' ? (
                      <StatusPill tone="success">Paid</StatusPill>
                    ) : b.status === 'cancelled' ? (
                      <StatusPill tone="danger">Cancelled</StatusPill>
                    ) : (
                      <StatusPill tone="warning">Pending payment</StatusPill>
                    )}
                    <span className={cn('text-ink-400 transition-transform', open && 'rotate-180')} aria-hidden="true">
                      ▾
                    </span>
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[13px] font-semibold text-ink-500 sm:grid-cols-4">
                  <span className="font-mono">{b.id}</span>
                  <span>{b.phone}</span>
                  <span>×{b.quantity} tickets</span>
                  <span className="font-extrabold text-ink-800">{formatETB(b.totalETB)}</span>
                </div>
              </button>

              {open && (
                <div className="border-t border-ink-950/8 px-4 py-3">
                  {loadingDetail ? (
                    <p className="py-2 text-[13px] font-semibold text-ink-400">Loading detail…</p>
                  ) : detail ? (
                    <div>
                      <div className="flex flex-wrap gap-2 text-[11px] font-extrabold tracking-wider uppercase">
                        <span className="rounded-full bg-ink-950/8 px-2.5 py-1 text-ink-600">
                          Booking: {detail.statusRaw ?? detail.status}
                        </span>
                        <span className="rounded-full bg-ink-950/8 px-2.5 py-1 text-ink-600">
                          Payment: {detail.paymentStatusRaw ?? detail.paymentStatus}
                        </span>
                        <span className="rounded-full bg-ink-950/8 px-2.5 py-1 text-ink-600">
                          {new Date(detail.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <ul className="mt-2.5 space-y-1.5">
                        {(detail.tickets ?? []).map((t) => (
                          <li
                            key={t.ticketNumber}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-cream-50 px-3 py-2 text-[13px] font-bold ring-1 ring-ink-950/8"
                          >
                            <span className="font-mono text-ink-900">{t.ticketNumber}</span>
                            <span className="flex items-center gap-2 text-ink-500">
                              {t.validatedAt && (
                                <span className="text-[11px]">
                                  used {new Date(t.validatedAt).toLocaleString()}
                                </span>
                              )}
                              <span
                                className={cn(
                                  'rounded-full px-2 py-0.5 text-[11px] font-extrabold',
                                  t.status === 'USED' && 'bg-ink-950/10 text-ink-600',
                                  t.status === 'ACTIVE' && 'bg-emerald-700/10 text-emerald-700',
                                  t.status === 'CANCELLED' && 'bg-wine-700/10 text-wine-700',
                                )}
                              >
                                {t.status}
                              </span>
                            </span>
                          </li>
                        ))}
                        {(detail.tickets ?? []).length === 0 && (
                          <li className="text-[13px] font-semibold text-ink-400">
                            No ticket records.
                          </li>
                        )}
                      </ul>
                    </div>
                  ) : (
                    <p className="py-2 text-[13px] font-semibold text-ink-400">
                      Detail unavailable.
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
        {visible.length === 0 && !error && (
          <li className="py-6 text-center text-sm font-semibold text-ink-400">
            No bookings yet — new orders appear here in real time.
          </li>
        )}
      </ul>
    </div>
  );
}

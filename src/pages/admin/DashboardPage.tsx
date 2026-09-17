import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { BookingRecord, CapacitySnapshot } from '../../lib/api';
import { getApi } from '../../lib/api';
import { formatETB } from '../../lib/format';
import { StatusPill } from '../../components/ui';

export function DashboardPage() {
  const [capacity, setCapacity] = useState<CapacitySnapshot | null>(null);
  const [recent, setRecent] = useState<BookingRecord[]>([]);
  const [collected, setCollected] = useState(0);

  useEffect(() => {
    const api = getApi();
    api.getCapacity('harar-open-air-cinema-001').then(setCapacity).catch(() => {});
    api
      .listBookings('harar-open-air-cinema-001')
      .then((all) => {
        setRecent(all.slice(0, 5));
        setCollected(
          all.filter((b) => b.paymentStatus === 'paid').reduce((s, b) => s + b.totalETB, 0),
        );
      })
      .catch(() => {});
  }, []);

  const pct = capacity ? Math.round((capacity.sold / capacity.total) * 100) : 0;
  const stats = [
    { label: 'Tickets sold', value: String(capacity?.sold ?? '—'), sub: `of ${capacity?.total ?? '—'} seats` },
    { label: 'Seats remaining', value: String(capacity?.remaining ?? '—'), sub: capacity?.isSoldOut ? 'Sold out' : 'Available now' },
    { label: 'Payments verified', value: formatETB(collected), sub: 'Sample data' },
    { label: 'Occupancy', value: `${pct}%`, sub: 'Capacity used' },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-3xl bg-cream-50 p-5 ring-1 ring-ink-950/10">
            <p className="text-[11px] font-extrabold tracking-[0.16em] text-ink-500 uppercase">{s.label}</p>
            <p className="mt-1.5 font-display text-3xl font-black text-ink-950">{s.value}</p>
            <p className="mt-0.5 text-xs font-bold text-ink-400">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="rounded-3xl bg-cream-50 p-5 ring-1 ring-ink-950/10 sm:p-6">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-lg font-black">Capacity</h2>
          <span className="text-sm font-bold text-ink-500">
            {capacity?.sold ?? 0} / {capacity?.total ?? 0} sold
          </span>
        </div>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-ink-950/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-wine-600 to-wine-500 transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-2 text-xs font-semibold text-ink-400">
          Oversell protection will be enforced by the backend at payment confirmation.
        </p>
      </div>

      <div className="rounded-3xl bg-cream-50 p-5 ring-1 ring-ink-950/10 sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-black">Latest bookings</h2>
          <Link to="/admin/bookings" className="text-[13px] font-extrabold text-wine-700 hover:underline">
            View all →
          </Link>
        </div>
        <ul className="mt-3 divide-y divide-ink-950/8">
          {recent.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-extrabold text-ink-950">{b.customerName}</span>
                <span className="block font-mono text-xs text-ink-400">{b.ticketNumber}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="font-bold text-ink-500">×{b.quantity}</span>
                {b.paymentStatus === 'paid' ? (
                  <StatusPill tone="success">Paid</StatusPill>
                ) : (
                  <StatusPill tone="warning">Pending</StatusPill>
                )}
              </span>
            </li>
          ))}
          {recent.length === 0 && (
            <li className="py-4 text-sm font-semibold text-ink-400">No bookings yet.</li>
          )}
        </ul>
      </div>
    </div>
  );
}

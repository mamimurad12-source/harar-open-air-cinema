/**
 * Organizer area shell (/admin/*). The backend enforces authentication on
 * every request; this guard is UX only (redirects signed-out organizers
 * to the login page instead of showing errors).
 */
import { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { AdminUser } from '../../lib/adminAuth';
import { adminLogout, adminMe } from '../../lib/adminAuth';
import { isMockApi } from '../../lib/api';
import { BrandMark, cn } from '../../components/ui';

const ADMIN_NAV = [
  { to: '/admin', label: 'Dashboard', end: true, icon: '◈' },
  { to: '/admin/events', label: 'Events', end: false, icon: '▣' },
  { to: '/admin/bookings', label: 'Bookings', end: false, icon: '☰' },
  { to: '/admin/payments', label: 'Payments', end: false, icon: '◉' },
  { to: '/admin/tickets', label: 'Validate tickets', end: false, icon: '✓' },
  { to: '/admin/settings', label: 'Settings', end: false, icon: '⚙' },
];

function AdminShell({ user }: { user: AdminUser | null }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const current = [...ADMIN_NAV].reverse().find((n) =>
    n.end ? location.pathname === n.to : location.pathname.startsWith(n.to),
  );

  const logout = async () => {
    try {
      await adminLogout();
    } finally {
      navigate('/admin/login', { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-cream-200/40">
      {isMockApi() && (
        <div className="bg-ink-950 px-4 py-2 text-center text-[11px] font-bold tracking-wide text-gold-300">
          MOCK MODE (VITE_USE_MOCK_API=true) — localStorage demo data, no login needed.
        </div>
      )}

      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6 lg:flex-row">
        {/* Sidebar */}
        <aside className="lg:w-64 lg:shrink-0">
          <div className="rounded-3xl bg-ink-950 p-4 text-cream-50 lg:sticky lg:top-5">
            <div className="flex items-center justify-between px-1">
              <Link to="/" className="flex items-center gap-2.5">
                <BrandMark className="bg-cream-50" />
                <span className="leading-tight">
                  <span className="block text-[13px] font-black tracking-wide">HARAR CINEMA</span>
                  <span className="block text-[10px] font-bold tracking-[0.22em] text-gold-300 uppercase">
                    Organizer
                  </span>
                </span>
              </Link>
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-label="Toggle admin menu"
                className="grid h-9 w-9 place-items-center rounded-full hover:bg-cream-50/10 lg:hidden"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h10" /></svg>
              </button>
            </div>
            <nav
              aria-label="Admin"
              className={cn('mt-3 space-y-1 lg:block', open ? 'block' : 'hidden')}
            >
              {ADMIN_NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-bold transition-colors',
                      isActive
                        ? 'bg-wine-600 text-cream-50'
                        : 'text-cream-100/70 hover:bg-cream-50/10 hover:text-cream-50',
                    )
                  }
                >
                  <span aria-hidden="true" className="w-5 text-center">{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
              <Link
                to="/"
                className="mt-2 flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-bold text-cream-100/60 transition-colors hover:bg-cream-50/10 hover:text-cream-50"
              >
                <span aria-hidden="true" className="w-5 text-center">←</span>
                View website
              </Link>
              {!isMockApi() && user && (
                <div className="mt-3 border-t border-cream-50/10 pt-3">
                  <p className="truncate px-4 text-xs font-bold text-cream-100/60" title={user.email}>
                    {user.name} • {user.role}
                  </p>
                  <button
                    type="button"
                    onClick={() => void logout()}
                    className="mt-1 flex w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-bold text-cream-100/70 transition-colors hover:bg-cream-50/10 hover:text-cream-50"
                  >
                    <span aria-hidden="true" className="w-5 text-center">⏻</span>
                    Sign out
                  </button>
                </div>
              )}
            </nav>
          </div>
        </aside>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <h1 className="px-1 font-display text-2xl font-black text-ink-950 sm:text-3xl">
            {current?.label ?? 'Admin'}
          </h1>
          <div className="mt-4">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminLayout() {
  const [user, setUser] = useState<AdminUser | null | undefined>(undefined);

  useEffect(() => {
    // Mock mode skips auth (no backend); real mode requires a session.
    if (isMockApi()) {
      setUser(null);
      return;
    }
    let cancelled = false;
    adminMe()
      .then((me) => {
        if (!cancelled) setUser(me);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (user === undefined) {
    return (
      <div className="grid min-h-screen place-items-center bg-cream-200/40">
        <p className="font-display text-lg font-bold text-ink-500 italic">Checking session…</p>
      </div>
    );
  }
  if (user === null && !isMockApi()) {
    return <Navigate to="/admin/login" replace />;
  }
  return <AdminShell user={user} />;
}

/** Organizer sign-in. Real session cookie is set by the backend. */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { adminLogin } from '../../lib/adminAuth';
import { ApiRequestError } from '../../lib/api';
import { BrandMark, cn } from '../../components/ui';

export function AdminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminLogin(email.trim(), password);
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : 'Could not sign in. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grain relative grid min-h-screen place-items-center overflow-hidden bg-ink-950 px-4 py-12">
      <div className="stars absolute inset-0 opacity-60" aria-hidden="true" />
      <div className="relative w-full max-w-md">
        <Link to="/" className="mx-auto flex w-fit items-center gap-2.5">
          <BrandMark className="bg-cream-50" />
          <span className="leading-tight">
            <span className="block text-[13px] font-black tracking-wide text-cream-50">
              HARAR CINEMA
            </span>
            <span className="block text-[10px] font-bold tracking-[0.22em] text-gold-300 uppercase">
              Organizer
            </span>
          </span>
        </Link>

        <form
          onSubmit={submit}
          className="mt-6 rounded-3xl bg-cream-50 p-6 shadow-2xl sm:p-8"
        >
          <h1 className="font-display text-2xl font-black text-ink-950">Welcome back ♥</h1>
          <p className="mt-1 text-sm font-semibold text-ink-500">
            Sign in to manage events, bookings and tickets.
          </p>

          {error && (
            <p role="alert" className="mt-4 rounded-2xl bg-wine-700/10 px-4 py-3 text-sm font-bold text-wine-700 ring-1 ring-wine-700/25">
              {error}
            </p>
          )}

          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-extrabold text-ink-800">Email</span>
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-2xl border-2 border-transparent bg-cream-100 px-4 py-3 text-[15px] font-semibold text-ink-950 placeholder:font-medium placeholder:text-ink-400 focus:border-wine-600/50 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-extrabold text-ink-800">Password</span>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-2xl border-2 border-transparent bg-cream-100 px-4 py-3 text-[15px] font-semibold text-ink-950 placeholder:font-medium placeholder:text-ink-400 focus:border-wine-600/50 focus:outline-none"
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={busy}
            className={cn(
              'mt-6 w-full rounded-full bg-wine-700 px-7 py-3.5 text-[15px] font-extrabold tracking-wide text-cream-50 transition-all hover:bg-wine-600 active:scale-[0.99]',
              busy && 'cursor-wait opacity-70',
            )}
          >
            {busy ? 'Signing in…' : 'Sign in →'}
          </button>

          <p className="mt-4 text-center text-xs font-semibold text-ink-400">
            Sessions expire after 12 hours. Never share your password.
          </p>
        </form>

        <p className="mt-5 text-center">
          <Link to="/" className="text-[13px] font-bold text-cream-100/60 hover:text-cream-50">
            ← Back to website
          </Link>
        </p>
      </div>
    </main>
  );
}

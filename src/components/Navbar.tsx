import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { NAV_LINKS, SITE } from '../config/site';
import { BrandMark, cn } from './ui';

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close the mobile menu on every navigation.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.hash]);

  // Lock body scroll while the mobile menu is open.
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open ]);

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-all duration-300',
        scrolled
          ? 'bg-ink-950/85 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.6)] backdrop-blur-md'
          : 'bg-gradient-to-b from-ink-950/80 to-transparent',
      )}
    >
      <nav
        aria-label="Primary"
        className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6"
      >
        <Link to="/" className="group flex items-center gap-2.5">
          <BrandMark className="bg-cream-50 text-ink-950 ring-1 ring-cream-50/20 transition-transform duration-300 group-hover:-rotate-6" />
          <span className="leading-tight">
            <span className="block font-display text-[15px] font-black tracking-wide text-cream-50">
              HARAR
            </span>
            <span className="block text-[10px] font-bold tracking-[0.28em] text-gold-300 uppercase">
              Open Air Cinema
            </span>
          </span>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.id}
              to={link.href}
              className="rounded-full px-4 py-2 text-[13px] font-bold tracking-wide text-cream-100/80 transition-colors hover:bg-cream-50/10 hover:text-cream-50"
            >
              {link.label}
            </Link>
          ))}
          <Link
            to="/book"
            className="ml-2 inline-flex items-center gap-1.5 rounded-full bg-wine-600 px-5 py-2.5 text-[13px] font-extrabold tracking-wide text-cream-50 shadow-lg transition-all hover:bg-wine-500 active:scale-95"
          >
            Book
            <span aria-hidden="true">→</span>
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? 'Close menu' : 'Open menu'}
          className="grid h-10 w-10 place-items-center rounded-full text-cream-50 transition-colors hover:bg-cream-50/10 md:hidden"
        >
          {open ? (
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 7h16M4 12h16M4 17h10" />
            </svg>
          )}
        </button>
      </nav>

      {/* Mobile menu */}
      <div
        className={cn(
          'overflow-hidden bg-ink-950/95 backdrop-blur-md transition-[max-height,opacity] duration-300 md:hidden',
          open ? 'max-h-[420px] opacity-100' : 'max-h-0 opacity-0',
        )}
      >
        <div className="space-y-1 px-4 pt-2 pb-6">
          {NAV_LINKS.map((link, i) => (
            <Link
              key={link.id}
              to={link.href}
              style={{ transitionDelay: open ? `${i * 40}ms` : '0ms' }}
              className={cn(
                'block rounded-xl px-4 py-3 font-display text-xl font-bold text-cream-50 transition-all hover:bg-cream-50/10',
                open ? 'translate-x-0 opacity-100' : '-translate-x-3 opacity-0',
              )}
            >
              {link.label}
            </Link>
          ))}
          <Link
            to="/book"
            className="mt-3 flex items-center justify-center gap-2 rounded-full bg-wine-600 px-4 py-3.5 text-sm font-extrabold tracking-wide text-cream-50"
          >
            Book Your Ticket <span aria-hidden="true">→</span>
          </Link>
          <p className="pt-3 text-center text-[11px] font-semibold tracking-widest text-cream-100/50 uppercase">
            {SITE.tagline}
          </p>
        </div>
      </div>
    </header>
  );
}

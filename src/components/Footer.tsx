import { Link } from 'react-router-dom';
import { LEGAL_LINKS, NAV_LINKS, SITE, SOCIALS } from '../config/site';
import { BrandMark } from './ui';

const SOCIAL_ICONS: Record<string, React.ReactNode> = {
  instagram: (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="3.8" /><circle cx="17" cy="7" r="1.2" fill="currentColor" stroke="none" /></svg>
  ),
  tiktok: (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="currentColor"><path d="M16.5 3c.4 2.3 1.9 3.8 4.2 4v3.1c-1.5 0-2.9-.5-4.2-1.3v6.5c0 3.9-2.6 6.2-6 6.2-3.3 0-5.7-2.4-5.7-5.5 0-3.2 2.6-5.6 6-5.6.3 0 .7 0 1 .1v3.2c-.3-.2-.7-.2-1-.2-1.6 0-2.8 1.1-2.8 2.5 0 1.4 1.1 2.4 2.6 2.4 1.6 0 2.7-1.1 2.7-3V3h3.2z" /></svg>
  ),
  telegram: (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="currentColor"><path d="M21.5 4.5 2.9 11.7c-.6.2-.6 1 .1 1.1l4.3 1.3 1.7 5.3c.2.6 1 .7 1.4.2l2.4-2.8 4.6 3.4c.5.3 1.1 0 1.2-.5l2.9-13.4c.1-.7-.5-1.2-1-1.1zM8.6 13.4l8.6-6.6c.2-.1.4.1.2.3l-7 7.3-.3 3-1.5-4z" /></svg>
  ),
  phone: (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" /></svg>
  ),
};

export function Footer() {
  return (
    <footer className="bg-ink-950 text-cream-100">
      <div className="film-strip h-8" aria-hidden="true" />
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          {/* Brand */}
          <div>
            <Link to="/" className="flex items-center gap-2.5">
              <BrandMark className="bg-cream-50" />
              <span className="leading-tight">
                <span className="block font-display text-lg font-black tracking-wide text-cream-50">
                  HARAR
                </span>
                <span className="block text-[10px] font-bold tracking-[0.28em] text-gold-300 uppercase">
                  Open Air Cinema
                </span>
              </span>
            </Link>
            <p className="mt-4 max-w-xs font-display text-lg text-cream-100/85 italic">
              “{SITE.tagline}”
            </p>
            <p className="mt-2 text-sm font-semibold text-cream-100/60">
              {SITE.city} • Arthur Rimbaud Museum
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {SOCIALS.map((social) =>
                social.href ? (
                  <a
                    key={social.id}
                    href={social.href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={social.label}
                    className="grid h-10 w-10 place-items-center rounded-full bg-cream-50/10 text-cream-50 ring-1 ring-cream-50/15 transition-all hover:bg-wine-600"
                  >
                    {SOCIAL_ICONS[social.id]}
                  </a>
                ) : (
                  <span
                    key={social.id}
                    title={`${social.label} — coming soon`}
                    aria-label={`${social.label} — coming soon`}
                    className="grid h-10 w-10 cursor-not-allowed place-items-center rounded-full border border-dashed border-cream-50/25 text-cream-100/40"
                  >
                    {SOCIAL_ICONS[social.id]}
                  </span>
                ),
              )}
            </div>
            <p className="mt-3 text-[11px] font-semibold text-cream-100/40">
              Social profiles coming soon.
            </p>
          </div>

          {/* Explore */}
          <nav aria-label="Footer">
            <p className="text-[11px] font-extrabold tracking-[0.24em] text-gold-300 uppercase">
              Explore
            </p>
            <ul className="mt-4 space-y-2.5">
              {NAV_LINKS.map((link) => (
                <li key={link.id}>
                  <Link
                    to={link.href}
                    className="text-sm font-bold text-cream-100/75 transition-colors hover:text-cream-50"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link to="/book" className="text-sm font-extrabold text-cream-50 underline decoration-wine-500 decoration-2 underline-offset-4 hover:decoration-gold-300">
                  Book Your Ticket
                </Link>
              </li>
            </ul>
          </nav>

          {/* Event + legal */}
          <div>
            <p className="text-[11px] font-extrabold tracking-[0.24em] text-gold-300 uppercase">
              This screening
            </p>
            <ul className="mt-4 space-y-2.5 text-sm font-bold text-cream-100/75">
              <li>9 — 1 — 2019 EC</li>
              <li>11:00 LT • Local time</li>
              <li>Arthur Rimbaud Museum</li>
              <li>250 ETB • Free snack</li>
            </ul>
            <div className="mt-5 flex gap-4 text-[13px] font-bold">
              {LEGAL_LINKS.map((link) =>
                link.href ? (
                  <a key={link.id} href={link.href} className="text-cream-100/60 hover:text-cream-50">
                    {link.label}
                  </a>
                ) : (
                  <span key={link.id} title="Coming soon" className="cursor-not-allowed text-cream-100/35">
                    {link.label}
                  </span>
                ),
              )}
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-cream-50/10 pt-6 text-center sm:flex-row sm:text-left">
          <p className="text-xs font-semibold text-cream-100/50">
            © {new Date().getFullYear()} {SITE.brand} • {SITE.city}
          </p>
          <p className="flex items-center gap-1.5 text-xs font-bold text-cream-100/50">
            Made with
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-wine-400" fill="currentColor" aria-hidden="true">
              <path d="M12 21s-7.5-4.7-9.6-9.3C1 8.6 2.9 5.9 5.7 5.9c2 0 3.4 1.1 4.2 2.5h4.2c.8-1.4 2.2-2.5 4.2-2.5 2.8 0 4.7 2.7 3.3 5.8C19.5 16.3 12 21 12 21z" />
            </svg>
            under the Harari sky
          </p>
        </div>
      </div>
    </footer>
  );
}

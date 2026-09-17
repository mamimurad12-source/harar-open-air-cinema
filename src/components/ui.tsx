/** Shared presentational primitives: buttons, headings, reveal-on-scroll. */
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/* ---------------- Reveal on scroll (subtle, fast, reduced-motion safe) ---------------- */

interface RevealProps {
  children: ReactNode;
  className?: string;
  delayMs?: number;
}

export function Reveal({ children, className, delayMs = 0 }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delayMs}ms` }}
      className={cn(
        'transition-all duration-500 ease-out will-change-transform',
        visible ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0',
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ---------------- Section heading ---------------- */

interface SectionHeadingProps {
  eyebrow: string;
  title: string;
  accent?: string;
  description?: string;
  dark?: boolean;
  align?: 'left' | 'center';
}

export function SectionHeading({
  eyebrow,
  title,
  accent,
  description,
  dark = false,
  align = 'center',
}: SectionHeadingProps) {
  return (
    <Reveal
      className={cn(
        'max-w-2xl',
        align === 'center' ? 'mx-auto text-center' : 'text-left',
      )}
    >
      <p
        className={cn(
          'flex items-center gap-2 text-[11px] font-extrabold tracking-[0.22em] uppercase',
          align === 'center' && 'justify-center',
          dark ? 'text-gold-300' : 'text-wine-700',
        )}
      >
        <HeartMark className={cn('h-3.5 w-3.5', dark ? 'text-gold-300' : 'text-wine-600')} />
        {eyebrow}
      </p>
      <h2
        className={cn(
          'mt-3 font-display text-3xl leading-[1.05] font-black text-balance sm:text-4xl lg:text-[2.75rem]',
          dark ? 'text-cream-50' : 'text-ink-950',
        )}
      >
        {title}{' '}
        {accent && (
          <span className={cn('italic', dark ? 'text-gold-300' : 'text-wine-700')}>
            {accent}
          </span>
        )}
      </h2>
      {description && (
        <p
          className={cn(
            'mt-3 text-[15px] leading-relaxed',
            dark ? 'text-cream-100/75' : 'text-ink-700/90',
          )}
        >
          {description}
        </p>
      )}
    </Reveal>
  );
}

/* ---------------- Buttons ---------------- */

const buttonBase =
  'inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 text-sm font-extrabold tracking-wide transition-all duration-200 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2';

interface ButtonProps {
  to: string;
  children: ReactNode;
  className?: string;
}

export function PrimaryButton({ to, children, className }: ButtonProps) {
  return (
    <Link
      to={to}
      className={cn(
        buttonBase,
        'bg-wine-700 text-cream-50 shadow-[0_10px_30px_-10px_rgba(117,26,26,0.7)] hover:bg-wine-600 hover:shadow-[0_14px_34px_-10px_rgba(117,26,26,0.8)] focus-visible:outline-wine-700',
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function LightButton({ to, children, className }: ButtonProps) {
  return (
    <Link
      to={to}
      className={cn(
        buttonBase,
        'bg-cream-50 text-ink-950 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.6)] hover:bg-white focus-visible:outline-cream-50',
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function GhostButton({ to, children, className }: ButtonProps) {
  return (
    <Link
      to={to}
      className={cn(
        buttonBase,
        'border border-current hover:bg-white/10 focus-visible:outline-current',
        className,
      )}
    >
      {children}
    </Link>
  );
}

/* ---------------- Small brand marks ---------------- */

export function HeartMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12 21s-7.5-4.7-9.6-9.3C1 8.6 2.9 5.9 5.7 5.9c2 0 3.4 1.1 4.2 2.5h4.2c.8-1.4 2.2-2.5 4.2-2.5 2.8 0 4.7 2.7 3.3 5.8C19.5 16.3 12 21 12 21z" />
    </svg>
  );
}

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'grid h-9 w-9 place-items-center rounded-xl bg-ink-950 text-cream-50',
        className,
      )}
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-5 w-5">
        <path
          d="M12 20s-6.8-4.2-8.7-8.4C1.9 8.7 3.6 6.3 6.1 6.3c1.8 0 3.1 1 3.8 2.3h4.2c.7-1.3 2-2.3 3.8-2.3 2.5 0 4.2 2.4 2.8 5.3C18.8 15.8 12 20 12 20z"
          fill="#A83232"
        />
        <circle cx="7" cy="4.2" r="0.9" fill="#FAF4E6" />
        <circle cx="12" cy="3.4" r="0.9" fill="#FAF4E6" />
        <circle cx="17" cy="4.2" r="0.9" fill="#FAF4E6" />
      </svg>
    </span>
  );
}

/* ---------------- Status pill ---------------- */

export function StatusPill({
  tone,
  children,
}: {
  tone: 'success' | 'warning' | 'muted' | 'danger';
  children: ReactNode;
}) {
  const tones: Record<string, string> = {
    success: 'bg-emerald-700/10 text-emerald-800 ring-emerald-700/25',
    warning: 'bg-gold-500/15 text-gold-600 ring-gold-500/40',
    muted: 'bg-ink-950/5 text-ink-700 ring-ink-950/15',
    danger: 'bg-wine-700/10 text-wine-700 ring-wine-700/25',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

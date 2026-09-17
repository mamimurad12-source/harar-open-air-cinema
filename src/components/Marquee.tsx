/** Scrolling tagline ribbon between hero and content. */
import { SITE } from '../config/site';

export function Marquee() {
  const words = SITE.tagline.split('•').map((w) => w.trim());
  const row = [...words, ...words, ...words];
  return (
    <div className="overflow-hidden border-y-4 border-ink-950 bg-wine-700 py-3" aria-hidden="true">
      <div className="animate-marquee flex w-max items-center gap-8 pr-8">
        {[0, 1].map((half) => (
          <div key={half} className="flex items-center gap-8">
            {row.map((word, i) => (
              <span
                key={`${half}-${i}`}
                className="flex items-center gap-8 text-sm font-extrabold tracking-[0.2em] whitespace-nowrap text-cream-50 uppercase"
              >
                {word}
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-gold-300" fill="currentColor">
                  <path d="M12 21s-7.5-4.7-9.6-9.3C1 8.6 2.9 5.9 5.7 5.9c2 0 3.4 1.1 4.2 2.5h4.2c.8-1.4 2.2-2.5 4.2-2.5 2.8 0 4.7 2.7 3.3 5.8C19.5 16.3 12 21 12 21z" />
                </svg>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

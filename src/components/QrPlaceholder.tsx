/**
 * Decorative QR-style placeholder. Clearly NOT a scannable code — the real
 * QR (encoding `booking.qrPayload`) is generated after payment integration.
 */
import { useMemo } from 'react';
import { cn } from './ui';

interface QrPlaceholderProps {
  seed?: string;
  className?: string;
  label?: string;
}

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function QrPlaceholder({ seed = 'harar-cinema', className, label }: QrPlaceholderProps) {
  const cells = useMemo(() => {
    const size = 21;
    let h = hashSeed(seed);
    const next = () => {
      h ^= h << 13;
      h ^= h >>> 17;
      h ^= h << 5;
      return (h >>> 0) / 4294967295;
    };
    const grid: boolean[] = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const inFinder =
          (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7);
        grid.push(inFinder ? true : next() > 0.52);
      }
    }
    return { grid, size };
  }, [seed]);

  const { grid, size } = cells;
  const unit = 100 / size;

  const finder = (fx: number, fy: number) => (
    <g key={`${fx}-${fy}`}>
      <rect x={fx * unit} y={fy * unit} width={unit * 7} height={unit * 7} fill="#120D08" />
      <rect
        x={(fx + 1) * unit}
        y={(fy + 1) * unit}
        width={unit * 5}
        height={unit * 5}
        fill="#FDFBF4"
      />
      <rect
        x={(fx + 2) * unit}
        y={(fy + 2) * unit}
        width={unit * 3}
        height={unit * 3}
        fill="#120D08"
      />
    </g>
  );

  return (
    <figure className={cn('flex flex-col items-center gap-2', className)}>
      <div className="relative rounded-xl bg-cream-50 p-2.5 ring-1 ring-ink-950/15">
        <svg
          viewBox="0 0 100 100"
          role="img"
          aria-label="QR code placeholder — real code appears after booking"
          className="block h-32 w-32 sm:h-36 sm:w-36"
        >
          <rect width="100" height="100" fill="#FDFBF4" />
          {grid.map((on, i) => {
            if (!on) return null;
            const x = i % size;
            const y = Math.floor(i / size);
            const inFinder =
              (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7);
            if (inFinder) return null;
            return (
              <rect
                key={i}
                x={x * unit + 0.15}
                y={y * unit + 0.15}
                width={unit - 0.3}
                height={unit - 0.3}
                rx="0.4"
                fill="#120D08"
                opacity="0.88"
              />
            );
          })}
          {finder(0, 0)}
          {finder(size - 7, 0)}
          {finder(0, size - 7)}
          {/* heart watermark marks it unmistakably as a placeholder */}
          <g transform="translate(50 50)">
            <circle r="11" fill="#FDFBF4" stroke="#A83232" strokeWidth="1.4" />
            <path
              d="M0 5.2C-3.4 2.4-6.4 0-6.4-2.9c0-1.8 1.4-3 3.1-3 1.4 0 2.6.8 3.3 2 .7-1.2 1.9-2 3.3-2 1.7 0 3.1 1.2 3.1 3C6.4 0 3.4 2.4 0 5.2z"
              fill="#A83232"
            />
          </g>
        </svg>
        <span className="absolute inset-x-6 -bottom-2 rounded-full bg-ink-950 px-2 py-0.5 text-center text-[9px] font-extrabold tracking-[0.18em] text-cream-50 uppercase">
          Sample
        </span>
      </div>
      {label && (
        <figcaption className="max-w-[11rem] text-center text-[11px] leading-snug font-semibold text-ink-500">
          {label}
        </figcaption>
      )}
    </figure>
  );
}

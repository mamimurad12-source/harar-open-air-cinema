/**
 * Real scannable QR code. Rendered ONLY for verified bookings — previews and
 * pending tickets keep using QrPlaceholder so an unscannable design can never
 * be mistaken for an admittable ticket.
 */
import { QRCodeSVG } from 'qrcode.react';
import { cn } from './ui';

interface QrCodeProps {
  value: string;
  label?: string;
  className?: string;
}

export function QrCode({ value, label, className }: QrCodeProps) {
  return (
    <figure className={cn('flex flex-col items-center gap-2', className)}>
      <div className="rounded-xl bg-cream-50 p-2.5 ring-1 ring-ink-950/15">
        <QRCodeSVG
          value={value}
          size={128}
          level="M"
          bgColor="#FDFBF4"
          fgColor="#120D08"
          role="img"
          aria-label="Ticket QR code — scan at the entrance"
          className="block h-32 w-32 sm:h-36 sm:w-36"
        />
      </div>
      {label && (
        <figcaption className="max-w-[11rem] text-center text-[11px] leading-snug font-semibold text-ink-500">
          {label}
        </figcaption>
      )}
    </figure>
  );
}

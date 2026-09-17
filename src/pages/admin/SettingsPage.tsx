/** Organizer settings — placeholders wired to real controls at backend time. */
import { PENDING_INFO } from '../../config/site';

function ComingSoonRow({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-cream-100 px-4 py-3.5 ring-1 ring-ink-950/8">
      <div>
        <p className="text-sm font-extrabold text-ink-950">{title}</p>
        <p className="text-[13px] font-semibold text-ink-400">{text}</p>
      </div>
      <span className="rounded-full bg-ink-950/8 px-3 py-1 text-[11px] font-extrabold tracking-widest text-ink-400 uppercase">
        Coming soon
      </span>
    </div>
  );
}

export function SettingsPage() {
  return (
    <div className="space-y-5">
      <div className="rounded-3xl bg-cream-50 p-5 ring-1 ring-ink-950/10 sm:p-6">
        <h2 className="font-display text-lg font-black">Organization</h2>
        <div className="mt-4 space-y-2.5">
          <ComingSoonRow title="Organizer contact" text={PENDING_INFO} />
          <ComingSoonRow title="Support phone / Telegram" text={PENDING_INFO} />
          <ComingSoonRow title="Team access & roles" text="Owner, box office, gate scanner." />
        </div>
      </div>
      <div className="rounded-3xl bg-cream-50 p-5 ring-1 ring-ink-950/10 sm:p-6">
        <h2 className="font-display text-lg font-black">Payments & tickets</h2>
        <div className="mt-4 space-y-2.5">
          <ComingSoonRow title="Payment provider" text="Chosen by the organizers before launch." />
          <ComingSoonRow title="Refund policy" text={PENDING_INFO} />
          <ComingSoonRow title="Ticket transfer rules" text={PENDING_INFO} />
        </div>
      </div>
      <div className="rounded-3xl bg-cream-50 p-5 ring-1 ring-ink-950/10 sm:p-6">
        <h2 className="font-display text-lg font-black">Public site</h2>
        <div className="mt-4 space-y-2.5">
          <ComingSoonRow title="Instagram / TikTok links" text="Added to the footer once supplied." />
          <ComingSoonRow title="Terms & Privacy" text="Published by the organizers." />
          <ComingSoonRow title="Google Maps embed" text="Drops into the venue map slot." />
        </div>
      </div>
    </div>
  );
}

/**
 * Organizer event manager — list, create, edit, publish/unpublish.
 * Writes go to the real backend (PATCH/POST /api/admin/events).
 */
import { useCallback, useEffect, useState } from 'react';
import type { CapacitySnapshot } from '../../lib/api';
import { ApiRequestError, getApi } from '../../lib/api';
import type { EventDetails, EventStatus } from '../../data/event';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-extrabold text-ink-800">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  'w-full rounded-2xl border-2 border-transparent bg-cream-100 px-4 py-3 text-[15px] font-semibold text-ink-950 placeholder:font-medium placeholder:text-ink-400 focus:border-wine-600/50 focus:outline-none';

const STATUS_LABEL: Record<EventStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  cancelled: 'Cancelled',
  completed: 'Completed',
};

function blankEvent(): EventDetails {
  return {
    id: '',
    name: 'Harar Open Air Cinema',
    status: 'draft',
    tagline: 'Good Movies • Great Company • Perfect Vibes',
    dateLabel: '',
    dateNote: 'Ethiopian calendar',
    timeLabel: '',
    timeNote: 'Local time',
    venue: 'Arthur Rimbaud Museum',
    city: 'Harar',
    country: 'Ethiopia',
    address: null,
    priceETB: 250,
    snackIncluded: true,
    snackNote: 'Free snack included with every ticket',
    capacityTotal: 100,
    capacityNote: 'Limited to around 100 guests',
    movie: {
      status: 'tba',
      title: null,
      tagline: null,
      synopsis: null,
      runtimeMinutes: null,
      language: null,
      rating: null,
      posterUrl: null,
      trailerUrl: null,
    },
  };
}

export function EventsPage() {
  const [events, setEvents] = useState<EventDetails[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [event, setEventState] = useState<EventDetails | null>(null);
  const [capacity, setCapacity] = useState<CapacitySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    const list = await getApi().listEvents();
    setEvents(list);
    return list;
  }, []);

  useEffect(() => {
    loadList()
      .then((list) => {
        const first = list[0];
        if (first) {
          setSelectedId(first.id);
          setEventState(first);
        } else {
          setEventState(blankEvent());
        }
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Could not load events.'),
      )
      .finally(() => setLoading(false));
  }, [loadList]);

  const selectEvent = async (id: string) => {
    if (id === '__new__') {
      setSelectedId('__new__');
      setEventState(blankEvent());
      setCapacity(null);
      setSaved(false);
      setError(null);
      return;
    }
    setSelectedId(id);
    setSaved(false);
    setError(null);
    setCapacity(null);
    const found = events.find((e) => e.id === id);
    if (found) {
      setEventState(found);
      try {
        setCapacity(await getApi().getCapacity(id));
      } catch {
        /* capacity is a nice-to-have here */
      }
    }
  };

  useEffect(() => {
    if (selectedId && selectedId !== '__new__' && event && !capacity) {
      getApi().getCapacity(selectedId).then(setCapacity).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  if (loading || !event) {
    return (
      <p className="text-sm font-semibold text-ink-400">
        {loading ? 'Loading events…' : 'No event selected.'}
      </p>
    );
  }

  const isNew = selectedId === '__new__' || event.id === '';
  const set = (patch: Partial<EventDetails>) => {
    setSaved(false);
    setError(null);
    setEventState({ ...event, ...patch });
  };
  const setMovie = (patch: Partial<EventDetails['movie']>) =>
    set({ movie: { ...event.movie, ...patch } });

  const save = async (next?: Partial<EventDetails>) => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const payload = next ? { ...event, ...next } : event;
      const api = getApi();
      const savedEvent = isNew
        ? await api.createEvent({
            title: payload.name,
            dateLabel: payload.dateLabel,
            timeLabel: payload.timeLabel,
            venue: payload.venue,
            city: payload.city,
            country: payload.country,
            priceETB: payload.priceETB,
            capacityTotal: payload.capacityTotal,
            snackIncluded: payload.snackIncluded,
            status: payload.status,
          })
        : await api.updateEvent(payload);
      // New events start as drafts; movie details save on the follow-up edit.
      const withMovie =
        isNew && (payload.movie.title || payload.movie.synopsis)
          ? await api.updateEvent({ ...savedEvent, movie: payload.movie })
          : savedEvent;
      const list = await loadList();
      setSelectedId(withMovie.id);
      setEventState(list.find((e) => e.id === withMovie.id) ?? withMovie);
      setCapacity(await api.getCapacity(withMovie.id));
      setSaved(true);
    } catch (err) {
      setError(
        err instanceof ApiRequestError || err instanceof Error
          ? err.message
          : 'Could not save. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Selector */}
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <select
          aria-label="Select event"
          value={selectedId}
          onChange={(e) => void selectEvent(e.target.value)}
          className="flex-1 rounded-2xl bg-cream-50 px-4 py-3 text-[15px] font-extrabold text-ink-950 ring-1 ring-ink-950/10 focus:outline-none"
        >
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} — {e.dateLabel} ({STATUS_LABEL[e.status]})
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void selectEvent('__new__')}
          className="rounded-2xl bg-ink-950 px-6 py-3 text-sm font-extrabold text-cream-50 transition-all hover:bg-ink-800"
        >
          + New event
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-2xl bg-wine-700/10 px-4 py-3 text-sm font-bold text-wine-700 ring-1 ring-wine-700/25">
          {error}
        </p>
      )}

      {/* Publish state + availability */}
      <div className="flex flex-col gap-4 rounded-3xl bg-cream-50 p-5 ring-1 ring-ink-950/10 sm:p-6 lg:flex-row lg:items-center">
        <div className="flex-1">
          <p className="text-[11px] font-extrabold tracking-[0.16em] text-ink-500 uppercase">
            Publishing
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5 rounded-2xl bg-cream-200/70 p-1.5">
            {(['draft', 'published', 'cancelled', 'completed'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => set({ status: s })}
                className={`rounded-xl px-4 py-2 text-[13px] font-extrabold transition-colors ${
                  event.status === s
                    ? s === 'published'
                      ? 'bg-emerald-700 text-cream-50'
                      : 'bg-ink-950 text-cream-50'
                    : 'text-ink-500 hover:text-ink-950'
                }`}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs font-semibold text-ink-400">
            Only <strong>published</strong> events appear on the website and accept bookings.
          </p>
        </div>
        {!isNew && (
          <div className="rounded-2xl bg-cream-100 px-5 py-4 ring-1 ring-ink-950/10 lg:text-right">
            <p className="text-[11px] font-extrabold tracking-[0.16em] text-ink-500 uppercase">
              Availability
            </p>
            <p className="mt-1 font-display text-2xl font-black text-ink-950">
              {capacity ? `${capacity.remaining} / ${capacity.total}` : '—'}
            </p>
            <p className="text-xs font-bold text-ink-400">
              {capacity ? `${capacity.sold} reserved` : 'loading…'}
            </p>
          </div>
        )}
      </div>

      {/* Screening details */}
      <div className="rounded-3xl bg-cream-50 p-5 ring-1 ring-ink-950/10 sm:p-6">
        <h2 className="font-display text-lg font-black">Screening details</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Event title">
              <input className={inputCls} value={event.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
          </div>
          <Field label="Date label (as on poster)">
            <input className={inputCls} value={event.dateLabel} onChange={(e) => set({ dateLabel: e.target.value })} placeholder="9-1-2019 EC" />
          </Field>
          <Field label="Time label (as on poster)">
            <input className={inputCls} value={event.timeLabel} onChange={(e) => set({ timeLabel: e.target.value })} placeholder="11:00 LT" />
          </Field>
          <Field label="Venue">
            <input className={inputCls} value={event.venue} onChange={(e) => set({ venue: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="City">
              <input className={inputCls} value={event.city} onChange={(e) => set({ city: e.target.value })} />
            </Field>
            <Field label="Country">
              <input className={inputCls} value={event.country} onChange={(e) => set({ country: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Price (ETB)">
              <input
                className={inputCls} type="number" min={0}
                value={event.priceETB}
                onChange={(e) => set({ priceETB: Math.max(0, Number(e.target.value) || 0) })}
              />
            </Field>
            <Field label="Capacity">
              <input
                className={inputCls} type="number" min={1}
                value={event.capacityTotal}
                onChange={(e) => set({ capacityTotal: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
              />
            </Field>
          </div>
          <label className="flex items-center gap-3 rounded-2xl bg-cream-100 px-4 py-3">
            <input
              type="checkbox"
              checked={event.snackIncluded}
              onChange={(e) => set({ snackIncluded: e.target.checked })}
              className="h-5 w-5 accent-[#751A1A]"
            />
            <span className="text-sm font-extrabold text-ink-900">Free snack included</span>
          </label>
        </div>
      </div>

      {/* Movie */}
      <div className="rounded-3xl bg-cream-50 p-5 ring-1 ring-ink-950/10 sm:p-6">
        <h2 className="font-display text-lg font-black">Featured movie</h2>
        <p className="mt-1 text-[13px] font-semibold text-ink-400">
          Publish the film here the moment it is confirmed — the website updates instantly.
        </p>
        <div className="mt-4 grid gap-4">
          <Field label="Announcement status">
            <select
              className={inputCls}
              value={event.movie.status}
              onChange={(e) => setMovie({ status: e.target.value as 'tba' | 'announced' })}
            >
              <option value="tba">Coming soon (placeholder shown)</option>
              <option value="announced">Announced (show details)</option>
            </select>
          </Field>
          <Field label="Movie title">
            <input
              className={inputCls} placeholder="Movie title coming soon"
              value={event.movie.title ?? ''}
              onChange={(e) => setMovie({ title: e.target.value || null })}
            />
          </Field>
          <Field label="Synopsis">
            <textarea
              className={`${inputCls} min-h-24 resize-y`} placeholder="Short synopsis…"
              value={event.movie.synopsis ?? ''}
              onChange={(e) => setMovie({ synopsis: e.target.value || null })}
            />
          </Field>
          <Field label="Trailer URL (mp4)">
            <input
              className={inputCls} placeholder="https://…"
              value={event.movie.trailerUrl ?? ''}
              onChange={(e) => setMovie({ trailerUrl: e.target.value || null })}
            />
          </Field>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-full bg-wine-700 px-8 py-3.5 text-sm font-extrabold tracking-wide text-cream-50 transition-all hover:bg-wine-600 disabled:opacity-60"
        >
          {saving ? 'Saving…' : isNew ? 'Create event' : 'Save changes'}
        </button>
        {!isNew && event.status !== 'published' && (
          <button
            type="button"
            onClick={() => void save({ status: 'published' })}
            disabled={saving}
            className="rounded-full bg-emerald-700 px-8 py-3.5 text-sm font-extrabold tracking-wide text-cream-50 transition-all hover:bg-emerald-600 disabled:opacity-60"
          >
            Save & publish ✓
          </button>
        )}
        {saved && (
          <p role="status" className="text-sm font-bold text-emerald-700">
            ✓ Saved — the live site reflects it now.
          </p>
        )}
      </div>
    </div>
  );
}

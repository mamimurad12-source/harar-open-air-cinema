/**
 * Data hooks — components fetch event/capacity state through these so the
 * mock → backend switch in `getApi()` propagates everywhere automatically.
 */
import { useCallback, useEffect, useState } from 'react';
import type { CapacitySnapshot } from './api';
import { getApi } from './api';
import type { EventDetails } from '../data/event';
import { HARAR_EVENT_SEED } from '../data/event';

interface EventState {
  event: EventDetails;
  capacity: CapacitySnapshot | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useEvent(): EventState {
  const [event, setEvent] = useState<EventDetails>(HARAR_EVENT_SEED);
  const [capacity, setCapacity] = useState<CapacitySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const api = getApi();
    Promise.all([api.getEvent(HARAR_EVENT_SEED.id), api.getCapacity(HARAR_EVENT_SEED.id)])
      .then(([nextEvent, nextCapacity]) => {
        if (cancelled) return;
        setEvent(nextEvent);
        setCapacity(nextCapacity);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load event data.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return { event, capacity, loading, error, refresh };
}

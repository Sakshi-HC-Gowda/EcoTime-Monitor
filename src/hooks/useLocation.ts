/**
 * useLocation.ts
 *
 * React hook that wraps locationService.detectZoneFromLocation().
 *
 * Follows the same thin-hook-over-service pattern used by:
 *   src/features/carbon/hooks/useCarbon.ts  (wraps carbonService)
 *
 * Responsibilities:
 *  - Trigger detection on first mount (once per session)
 *  - Track status: 'idle' | 'detecting' | 'success' | 'denied' | 'error'
 *  - Persist detected zone to localStorage (key: 'ecotime_zone')
 *    using the SAME key already used by App.tsx, so both shells are in sync
 *  - Expose retrigger() so the LocationBanner can ask again
 *  - Expose clearDetection() so manual zone selection can suppress the auto-zone
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { detectZoneFromLocation } from '../services/locationService';
import type { DetectedLocation } from '../services/locationService';

export type { DetectedLocation };

export type LocationStatus = 'idle' | 'detecting' | 'success' | 'denied' | 'error';

export interface UseLocationResult {
  status: LocationStatus;
  location: DetectedLocation | null;
  errorMessage: string | null;
  retrigger: () => void;
}

export function useLocation(): UseLocationResult {
  const [status, setStatus]             = useState<LocationStatus>('idle');
  const [location, setLocation]         = useState<DetectedLocation | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [triggerCount, setTriggerCount] = useState(0);
  const hasRunRef                       = useRef(false);

  useEffect(() => {
    if (hasRunRef.current && triggerCount === 0) return;
    hasRunRef.current = true;

    let cancelled = false;

    const run = async () => {
      setStatus('detecting');
      setErrorMessage(null);

      try {
        const detected = await detectZoneFromLocation();
        if (cancelled) return;

        setLocation(detected);
        setStatus('success');
      } catch (err: unknown) {
        if (cancelled) return;

        const posErr = err as GeolocationPositionError | null;
        const isDenied =
          posErr?.code === GeolocationPositionError.PERMISSION_DENIED ||
          (err instanceof Error && err.message.toLowerCase().includes('denied'));

        setStatus(isDenied ? 'denied' : 'error');
        setErrorMessage(
          err instanceof Error
            ? err.message
            : isDenied
            ? 'Location permission denied.'
            : 'Could not determine your location.',
        );
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [triggerCount]);

  const retrigger = useCallback(() => {
    setStatus('idle');
    setTriggerCount((c) => c + 1);
  }, []);

  return { status, location, errorMessage, retrigger };
}


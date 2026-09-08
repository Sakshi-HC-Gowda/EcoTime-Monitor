import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { useLocation } from '@/hooks/useLocation';
import type { DetectedLocation } from '@/services/locationService';
import type { LocationStatus } from '@/hooks/useLocation';

export const ZONE_STORAGE_KEY = 'ecotime_zone';

interface ZoneContextValue {
  selectedZone: string | null;
  setSelectedZone: (zone: string | null) => void;
  detectedLocation: DetectedLocation | null;
  locationStatus: LocationStatus;
  locationError: string | null;
  retryDetection: () => void;
}

const ZoneContext = createContext<ZoneContextValue | null>(null);

function readStoredZone(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ZONE_STORAGE_KEY);
}

export function ZoneProvider({ children }: { children: ReactNode }) {
  const { status, location, errorMessage, retrigger } = useLocation();
  const [selectedZone, setSelectedZoneState] = useState<string | null>(readStoredZone);

  useEffect(() => {
    // On successful detection, adopt the detected zone (overrides empty/null stored)
    if (status === 'success' && location) {
      setSelectedZoneState(location.zone);
      try {
        localStorage.setItem(ZONE_STORAGE_KEY, location.zone);
      } catch (e) {
        // ignore storage errors
      }
    }
  }, [status, location]);

  const setSelectedZone = useCallback((zone: string | null) => {
    setSelectedZoneState(zone);
    try {
      if (zone) localStorage.setItem(ZONE_STORAGE_KEY, zone);
      else localStorage.removeItem(ZONE_STORAGE_KEY);
    } catch (e) {
      // ignore storage errors
    }
  }, []);

  return (
    <ZoneContext.Provider
      value={{
        selectedZone,
        setSelectedZone,
        detectedLocation: location,
        locationStatus: status,
        locationError: errorMessage,
        retryDetection: retrigger,
      }}
    >
      {children}
    </ZoneContext.Provider>
  );
}

export function useZone() {
  const ctx = useContext(ZoneContext);
  if (!ctx) {
    throw new Error('useZone must be used within ZoneProvider');
  }
  return ctx;
}

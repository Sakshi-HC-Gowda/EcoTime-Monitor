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
  selectedZone: string;
  setSelectedZone: (zone: string) => void;
  detectedLocation: DetectedLocation | null;
  locationStatus: LocationStatus;
  locationError: string | null;
  retryDetection: () => void;
}

const ZoneContext = createContext<ZoneContextValue | null>(null);

function readStoredZone(): string {
  if (typeof window === 'undefined') return 'US-CA';
  return localStorage.getItem(ZONE_STORAGE_KEY) ?? 'US-CA';
}

export function ZoneProvider({ children }: { children: ReactNode }) {
  const { status, location, errorMessage, retrigger } = useLocation();
  const [selectedZone, setSelectedZoneState] = useState(readStoredZone);

  useEffect(() => {
    if (status === 'success' && location) {
      setSelectedZoneState(location.zone);
      localStorage.setItem(ZONE_STORAGE_KEY, location.zone);
    }
  }, [status, location]);

  const setSelectedZone = useCallback((zone: string) => {
    setSelectedZoneState(zone);
    localStorage.setItem(ZONE_STORAGE_KEY, zone);
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

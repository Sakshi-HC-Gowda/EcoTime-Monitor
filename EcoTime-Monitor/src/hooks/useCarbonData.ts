/**
 * useCarbonData — Carbon intensity data fetching and green window detection.
 *
 * Encapsulates:
 *   - fetchCarbonData() call (live API or simulation fallback)
 *   - Green window detection from forecast
 *   - Loading / error state
 *   - Re-fetches when zone, apiKey, threshold, or offsetHours change
 */

import { useState, useEffect, useCallback } from 'react';
import { fetchCarbonData } from '../services/electricityMaps';
import type { CarbonResponse, CarbonDataPoint } from '../services/electricityMaps';
import type { GreenWindow } from '../types/domain';

interface UseCarbonDataOptions {
  zone: string;
  apiKey: string | null;
  lowCarbonThreshold: number;
  offsetHours: number;
}

interface UseCarbonDataResult {
  carbonData: CarbonResponse | null;
  greenWindows: GreenWindow[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/** Detect contiguous green windows from a forecast array */
function detectGreenWindows(
  forecast: CarbonDataPoint[],
  threshold: number
): GreenWindow[] {
  const windows: GreenWindow[] = [];
  let currentBlock: CarbonDataPoint[] = [];
  let windowCount = 0;

  const forecastPeak = Math.max(...forecast.map(p => p.carbonIntensity), 300);

  const buildWindow = (block: CarbonDataPoint[]): GreenWindow => {
    windowCount++;
    const avgIntensity =
      block.reduce((acc, p) => acc + p.carbonIntensity, 0) / block.length;
    const savingsPercent = Math.max(
      5,
      ((forecastPeak - avgIntensity) / forecastPeak) * 100
    );
    const startDate = new Date(block[0].datetime);
    const startHour = startDate.getHours();

    let userConvenience = 60;
    if (startHour >= 22 || startHour <= 5) userConvenience = 90;
    else if (startHour >= 9 && startHour <= 17) userConvenience = 75;

    return {
      id: `win-${windowCount}`,
      startTime: block[0].datetime,
      duration: block.length * 60,
      avgCarbonIntensity: Math.round(avgIntensity),
      carbonSavingPercent: savingsPercent,
      userConvenience,
    };
  };

  for (const point of forecast) {
    if (point.carbonIntensity < threshold) {
      currentBlock.push(point);
    } else {
      if (currentBlock.length > 0) {
        windows.push(buildWindow(currentBlock));
        currentBlock = [];
      }
    }
  }
  if (currentBlock.length > 0) {
    windows.push(buildWindow(currentBlock));
  }

  return windows;
}

export function useCarbonData({
  zone,
  apiKey,
  lowCarbonThreshold,
  offsetHours,
}: UseCarbonDataOptions): UseCarbonDataResult {
  const [carbonData, setCarbonData] = useState<CarbonResponse | null>(null);
  const [greenWindows, setGreenWindows] = useState<GreenWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const data = await fetchCarbonData(zone, apiKey, offsetHours);
        if (cancelled) return;

        setCarbonData(data);
        setGreenWindows(detectGreenWindows(data.forecast, lowCarbonThreshold));
        setError(data.error ?? null);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setError(msg);
        console.error('[useCarbonData] fetch failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [zone, apiKey, lowCarbonThreshold, offsetHours, tick]);

  return { carbonData, greenWindows, loading, error, refresh };
}

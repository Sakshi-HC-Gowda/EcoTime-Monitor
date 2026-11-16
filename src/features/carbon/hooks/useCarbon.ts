import { useQuery } from '@tanstack/react-query';
import { carbonService } from '@/services/carbonService';
import { DEFAULT_GREEN_WINDOW_THRESHOLD } from '@/constants/carbon';

export function useCarbon(zone: string | null | undefined, offset: number = 0) {
  return useQuery({
    queryKey: ['carbon', zone, offset],
    queryFn: async () => {
      if (!zone) throw new Error('Zone is required');
      const res = await carbonService.getCarbonData(zone, offset);
      if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch carbon data');
      return res.data;
    },
    enabled: !!zone,
    refetchInterval: 30_000,
  });
}

export function useGreenWindows(zone: string | null | undefined, threshold: number = DEFAULT_GREEN_WINDOW_THRESHOLD, offset: number = 0, enabled: boolean = true) {
  return useQuery({
    queryKey: ['windows', zone, threshold, offset],
    queryFn: async () => {
      if (!zone) throw new Error('Zone is required');
      const res = await carbonService.getGreenWindows(zone, threshold, offset);
      if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch green windows');
      return res.data;
    },
    enabled: enabled && !!zone,
    refetchInterval: 30_000,
  });
}

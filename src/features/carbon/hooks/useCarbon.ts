import { useQuery } from '@tanstack/react-query';
import { carbonService } from '@/services/carbonService';

export function useCarbon(zone: string = 'US-CA', offset: number = 0) {
  return useQuery({
    queryKey: ['carbon', zone, offset],
    queryFn: async () => {
      const res = await carbonService.getCarbonData(zone, offset);
      if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch carbon data');
      return res.data;
    },
    refetchInterval: 30_000,
  });
}

export function useGreenWindows(zone: string = 'US-CA', threshold: number = 180, offset: number = 0, enabled: boolean = true) {
  return useQuery({
    queryKey: ['windows', zone, threshold, offset],
    queryFn: async () => {
      const res = await carbonService.getGreenWindows(zone, threshold, offset);
      if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch green windows');
      return res.data;
    },
    enabled,
    refetchInterval: 30_000,
  });
}

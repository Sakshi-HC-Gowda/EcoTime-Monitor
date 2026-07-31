import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { forecastService } from '@/services/forecastService';

export function useForecast(zone: string = 'US-CA', hours: number = 36) {
  return useQuery({
    queryKey: ['forecast', zone, hours],
    queryFn: async () => {
      const res = await forecastService.getForecast(zone, hours);
      if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch forecast');
      return res.data;
    },
    refetchInterval: 60_000,
  });
}

export function useForecastInfo() {
  return useQuery({
    queryKey: ['forecast-info'],
    queryFn: async () => {
      const res = await forecastService.getInfo();
      if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch model info');
      return res.data;
    },
    refetchInterval: 30_000,
  });
}

export function useTrainModel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (hours: number = 4380) => forecastService.triggerTraining(hours),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forecast-info'] });
      queryClient.invalidateQueries({ queryKey: ['forecast'] });
    },
  });
}

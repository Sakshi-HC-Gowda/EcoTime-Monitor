import { useQuery, useMutation } from '@tanstack/react-query';
import { optimizerService } from '@/services/optimizerService';
import type { SchedulingRequest, SchedulingResponse, EcoScore } from '@/types/domain';

export function useEcoScore(taskId: string | undefined, currentIntensity: number, baselineIntensity: number = 380, peakIntensity: number = 800) {
  return useQuery({
    queryKey: ['eco-score', taskId, currentIntensity, baselineIntensity],
    queryFn: async (): Promise<EcoScore> => {
      if (!taskId) throw new Error('Task ID required');
      const res = await optimizerService.getEcoScore(taskId, currentIntensity, baselineIntensity, peakIntensity);
      if (!res.success || !res.data) {
        throw new Error(res.error || 'Failed to fetch EcoScore');
      }
      return res.data;
    },
    enabled: !!taskId,
  });
}

export function useRunOptimization() {
  return useMutation({
    mutationFn: async (request: SchedulingRequest): Promise<SchedulingResponse> => {
      const res = await optimizerService.runScheduler(request);
      if (!res.success || !res.data) {
        throw new Error(res.error || 'Failed to run optimization');
      }
      return res.data;
    },
  });
}

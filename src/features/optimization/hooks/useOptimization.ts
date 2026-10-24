import { useQuery, useMutation } from '@tanstack/react-query';
import { optimizerService } from '@/services/optimizerService';
import type { GreenWindow, SchedulingRequest, SchedulingResponse, EcoScore, Task } from '@/types/domain';

export function useSimulationConfig() {
  return useQuery({
    queryKey: ['simulation-config'],
    queryFn: async () => {
      const response = await optimizerService.getSimulationConfig();
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch simulation configuration');
      }
      return response.data;
    },
    staleTime: 60_000,
  });
}

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

export function useOptimizationSchedule(
  tasks: Task[],
  window: GreenWindow | null,
  method: SchedulingRequest['method'],
  enabled: boolean = true,
  zone?: string,
) {
  const taskSignature = tasks
    .map((task) => `${task.id}:${task.updatedAt}:${task.status}`)
    .join('|');

  return useQuery({
    queryKey: ['optimization-schedule', zone, method, window?.id, taskSignature],
    queryFn: async (): Promise<SchedulingResponse> => {
      const res = await optimizerService.runScheduler({
        tasks,
        ...(window ? { window } : {}),
        method,
        zone,
      });
      if (!res.success || !res.data) {
        throw new Error(res.error || 'Failed to run optimization');
      }
      return res.data;
    },
    enabled: enabled && tasks.length > 0,
  });
}

import { useQuery, useMutation } from '@tanstack/react-query';
import { activitiesService } from '@/services/activitiesService';
import { optimizerService } from '@/services/optimizerService';
import type {
  GreenWindow,
  OptimizationInputSnapshot,
  SchedulingRequest,
  SchedulingResponse,
  EcoScore,
  Task,
} from '@/types/domain';

export function useOptimizationActivities(userId: number | null, organizationId: number | null) {
  return useQuery({
    queryKey: ['optimization-activities', userId, organizationId],
    queryFn: async () => {
      const response = await activitiesService.getAllTasks();
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch activities');
      }
      return response.data;
    },
    enabled: userId !== null && organizationId !== null,
    refetchInterval: 10_000,
  });
}

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
  userId?: number | null,
  organizationId?: number | null,
  allActivities: Task[] = tasks,
  refreshToken = 0,
) {
  const inputSnapshot: OptimizationInputSnapshot = {
    zone: zone ?? '',
    method,
    activities: [...allActivities]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((task) => ({
        id: task.id,
        updatedAt: task.updatedAt ?? null,
        status: task.status,
        assignedWindowId: task.assignedWindowId ?? null,
        duration: task.duration,
        powerDraw: task.powerDraw,
        type: task.type,
        activityType: task.activityType,
        priorityScore: task.priorityScore ?? null,
      })),
  };
  const snapshotKey = JSON.stringify(inputSnapshot);
  const taskSignature = tasks
    .map((task) => [
      task.id,
      task.updatedAt,
      task.status,
      task.type,
      task.activityType,
      task.priorityScore,
      task.duration,
      task.powerDraw,
    ].join(':'))
    .join('|');

  return useQuery({
    queryKey: [
      'optimization-schedule',
      userId,
      organizationId,
      zone,
      method,
      window?.id,
      snapshotKey,
      taskSignature,
      refreshToken,
    ],
    queryFn: async ({ queryKey, client }): Promise<SchedulingResponse> => {
      const isInvalidated = client.getQueryState(queryKey)?.isInvalidated ?? false;
      if (refreshToken === 0 && !isInvalidated) {
        const latest = await optimizerService.getLatestOptimization();
        if (!latest.success) {
          throw new Error(latest.error || 'Failed to load the latest optimization');
        }
        if (
          latest.data
          && matchesInputSnapshot(latest.data.inputSnapshot, inputSnapshot)
          && isRecentOptimization(latest.data.response)
        ) {
          return latest.data.response;
        }
      }

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

function isRecentOptimization(response: SchedulingResponse): boolean {
  const observedAt = response.carbonData.observedAt;
  if (!observedAt) return false;
  const observedAtTime = new Date(observedAt).getTime();
  return Number.isFinite(observedAtTime) && Date.now() - observedAtTime <= 60 * 60 * 1000;
}

function matchesInputSnapshot(
  persisted: OptimizationInputSnapshot,
  current: OptimizationInputSnapshot,
): boolean {
  return persisted.zone === current.zone
    && persisted.method === current.method
    && persisted.activities.length === current.activities.length
    && persisted.activities.every((activity, index) => {
      const currentActivity = current.activities[index];
      return currentActivity !== undefined
        && activity.id === currentActivity.id
        && activity.updatedAt === currentActivity.updatedAt
        && activity.status === currentActivity.status
        && activity.assignedWindowId === currentActivity.assignedWindowId
        && activity.duration === currentActivity.duration
        && activity.powerDraw === currentActivity.powerDraw
        && activity.type === currentActivity.type
        && activity.activityType === currentActivity.activityType
        && activity.priorityScore === currentActivity.priorityScore;
    });
}

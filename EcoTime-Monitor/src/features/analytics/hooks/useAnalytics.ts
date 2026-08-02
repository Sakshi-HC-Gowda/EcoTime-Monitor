import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { analyticsService } from '@/services/analyticsService';
import type { RecommendationStatus } from '@/types/domain';

/** Full analytics payload: totals, today's breakdown, weekly summary, EcoScore + trend. */
export function useAnalytics(zone: string = 'US-CA') {
  return useQuery({
    queryKey: ['analytics', zone],
    queryFn: async () => {
      const res = await analyticsService.getAnalytics(zone);
      if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch analytics');
      return res.data;
    },
    refetchInterval: 30_000,
  });
}

/** Lightweight dashboard summary — merge with useCarbon/useGreenWindows/useActivitiesQuery. */
export function useDashboardSummary(zone: string = 'US-CA') {
  return useQuery({
    queryKey: ['dashboard-summary', zone],
    queryFn: async () => {
      const res = await analyticsService.getDashboard(zone);
      if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch dashboard summary');
      return res.data;
    },
    refetchInterval: 15_000,
  });
}

/** Paginated activity status-transition history. */
export function useActivityHistory(page: number = 1, pageSize: number = 20, activityId?: string) {
  return useQuery({
    queryKey: ['history', page, pageSize, activityId],
    queryFn: async () => {
      const res = await analyticsService.getHistory(page, pageSize, activityId);
      if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch history');
      return res.data;
    },
    refetchInterval: 30_000,
  });
}

/** Paginated recommendation log. */
export function useRecommendations(page: number = 1, pageSize: number = 20, status?: RecommendationStatus) {
  return useQuery({
    queryKey: ['recommendations', page, pageSize, status],
    queryFn: async () => {
      const res = await analyticsService.getRecommendations(page, pageSize, status);
      if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch recommendations');
      return res.data;
    },
    refetchInterval: 30_000,
  });
}

/** Aggregate status counts + system operating flag. */
export function useSystemStatus() {
  return useQuery({
    queryKey: ['status'],
    queryFn: async () => {
      const res = await analyticsService.getStatus();
      if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch status');
      return res.data;
    },
    refetchInterval: 15_000,
  });
}

export function useRecommendationMutations() {
  const queryClient = useQueryClient();

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: RecommendationStatus }) =>
      analyticsService.updateRecommendation(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recommendations'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
  });

  return { updateStatus };
}

export function useSystemStatusMutations() {
  const queryClient = useQueryClient();

  const setActive = useMutation({
    mutationFn: (isActive: boolean) => analyticsService.setSystemStatus(isActive),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['status'] }),
  });

  return { setActive };
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { activitiesService, type ActivityScheduleRequest } from '@/services/activitiesService';
import type { CreateTaskRequest, UpdateTaskRequest } from '@/types/domain';

export function useActivitiesQuery(page: number = 1, pageSize: number = 50, status?: string) {
  return useQuery({
    queryKey: ['activities', page, pageSize, status],
    queryFn: async () => {
      const res = await activitiesService.getTasks(page, pageSize, status);
      if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch activities');
      return res.data;
    },
    refetchInterval: 10_000,
  });
}

export function useActivityMutations() {
  const queryClient = useQueryClient();
  const invalidateOptimizationActivities = () => {
    void queryClient.invalidateQueries({ queryKey: ['optimization-activities'] });
  };

  const createMutation = useMutation({
    mutationFn: ({ task, idempotencyKey }: { task: CreateTaskRequest; idempotencyKey: string }) =>
      activitiesService.createTask(task, idempotencyKey),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['activities'] });
      invalidateOptimizationActivities();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, update }: { id: string; update: UpdateTaskRequest }) =>
      activitiesService.updateTask(id, update),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['activities'] });
      invalidateOptimizationActivities();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await activitiesService.deleteTask(id);
      if (!response.success) throw new Error(response.error || 'Could not delete activity');
      return response;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['activities'] });
      invalidateOptimizationActivities();
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: async ({ id, request }: { id: string; request?: ActivityScheduleRequest }) => {
      const response = await activitiesService.scheduleTask(id, request);
      if (!response.success || !response.data) throw new Error(response.error || 'Scheduling failed');
      return response.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['activities'] });
      void queryClient.invalidateQueries({ queryKey: ['windows'] });
      invalidateOptimizationActivities();
    },
  });

  const runMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await activitiesService.runTask(id);
      if (!response.success || !response.data) throw new Error(response.error || 'Could not start the simulated run');
      if (response.data.activity.status !== 'running') {
        throw new Error('The server did not confirm that the activity started running');
      }
      return response.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['activities'] });
      invalidateOptimizationActivities();
    },
  });

  return { createMutation, updateMutation, deleteMutation, scheduleMutation, runMutation };
}

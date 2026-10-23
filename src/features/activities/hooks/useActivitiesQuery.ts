import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { activitiesService } from '@/services/activitiesService';
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

  const createMutation = useMutation({
    mutationFn: ({ task, idempotencyKey }: { task: CreateTaskRequest; idempotencyKey: string }) =>
      activitiesService.createTask(task, idempotencyKey),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['activities'] }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, update }: { id: string; update: UpdateTaskRequest }) =>
      activitiesService.updateTask(id, update),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['activities'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await activitiesService.deleteTask(id);
      if (!response.success) throw new Error(response.error || 'Could not delete activity');
      return response;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['activities'] }),
  });

  const scheduleMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await activitiesService.scheduleTask(id);
      if (!response.success || !response.data) throw new Error(response.error || 'Scheduling failed');
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['activities'] }),
  });

  const runMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await activitiesService.runTask(id);
      if (!response.success || !response.data) throw new Error(response.error || 'Could not start the simulated run');
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['activities'] }),
  });

  return { createMutation, updateMutation, deleteMutation, scheduleMutation, runMutation };
}

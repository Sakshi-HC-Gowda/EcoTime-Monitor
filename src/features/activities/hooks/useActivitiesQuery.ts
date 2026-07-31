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
    mutationFn: (task: CreateTaskRequest) => activitiesService.createTask(task),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['activities'] }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, update }: { id: string; update: UpdateTaskRequest }) =>
      activitiesService.updateTask(id, update),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['activities'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => activitiesService.deleteTask(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['activities'] }),
  });

  return { createMutation, updateMutation, deleteMutation };
}

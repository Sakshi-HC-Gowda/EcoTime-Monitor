import { apiClient } from './apiClient';
import type { Task, CreateTaskRequest, UpdateTaskRequest, PaginatedResponse, ApiResponse, SchedulingRecommendation } from '../types/domain';

export interface ActivityScheduleResult {
  scheduled: boolean;
  activity?: Task;
  recommendation: SchedulingRecommendation | null;
}

export interface ActivityExecutionResult {
  activity: Task;
  executionMode: 'simulated';
}

export const activitiesService = {
  async getTasks(page: number = 1, pageSize: number = 50, status?: string): Promise<ApiResponse<PaginatedResponse<Task>>> {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (status) params.append('status', status);

    return apiClient.request<PaginatedResponse<Task>>(`/activities?${params.toString()}`);
  },

  async getTask(id: string): Promise<ApiResponse<Task>> {
    return apiClient.request<Task>(`/activities/${id}`);
  },

  async createTask(task: CreateTaskRequest, idempotencyKey?: string): Promise<ApiResponse<Task>> {
    return apiClient.request<Task>('/activities', {
      method: 'POST',
      body: JSON.stringify(task),
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
    });
  },

  async updateTask(id: string, update: UpdateTaskRequest): Promise<ApiResponse<Task>> {
    return apiClient.request<Task>(`/activities/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(update),
    });
  },

  async scheduleTask(id: string): Promise<ApiResponse<ActivityScheduleResult>> {
    return apiClient.request<ActivityScheduleResult>(`/activities/${encodeURIComponent(id)}/schedule`, {
      method: 'POST',
    });
  },

  async runTask(id: string): Promise<ApiResponse<ActivityExecutionResult>> {
    return apiClient.request<ActivityExecutionResult>(`/activities/${encodeURIComponent(id)}/run`, {
      method: 'POST',
    });
  },

  async deleteTask(id: string): Promise<ApiResponse<void>> {
    return apiClient.request<void>(`/activities/${id}`, {
      method: 'DELETE',
    });
  },

  async bulkUpdate(updates: { id: string; status?: string; progress?: number; assignedWindowId?: string }[]): Promise<ApiResponse<Task[]>> {
    return apiClient.request<Task[]>('/activities/bulk', {
      method: 'POST',
      body: JSON.stringify({ updates }),
    });
  },
};

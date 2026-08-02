import { apiClient } from './apiClient';
import type { Task, CreateTaskRequest, UpdateTaskRequest, PaginatedResponse, ApiResponse } from '../types/domain';

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

  async createTask(task: CreateTaskRequest): Promise<ApiResponse<Task>> {
    return apiClient.request<Task>('/activities', {
      method: 'POST',
      body: JSON.stringify(task),
    });
  },

  async updateTask(id: string, update: UpdateTaskRequest): Promise<ApiResponse<Task>> {
    return apiClient.request<Task>(`/activities/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(update),
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

/**
 * Frontend API Service
 * Handles all REST calls to the backend with fallback to simulation mode
 */

import type {
  Task,
  CreateTaskRequest,
  UpdateTaskRequest,
  CarbonResponse,
  GreenWindow,
  SchedulingRequest,
  SchedulingResponse,
  ApiResponse,
  PaginatedResponse,
  EcoScore,
  SimulationConfig,
} from '../types/domain';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api';

class ApiClient {
  private baseUrl: string;
  private isBackendAvailable: boolean = false;

  constructor(baseUrl: string = API_BASE) {
    this.baseUrl = baseUrl;
    this.checkBackendHealth();
  }

  private async checkBackendHealth(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, { method: 'GET' });
      this.isBackendAvailable = response.ok;
    } catch {
      this.isBackendAvailable = false;
      console.warn('Backend service unavailable. Falling back to simulation mode.');
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    try {
      const response = await fetch(url, { ...options, headers });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // ========================================================================
  // Carbon Data Endpoints
  // ========================================================================

  async getCarbonData(zone: string, offset?: number): Promise<ApiResponse<CarbonResponse>> {
    const params = new URLSearchParams();
    params.append('zone', zone);
    if (offset !== undefined) params.append('offset', String(offset));

    return this.request<CarbonResponse>(`/carbon?${params.toString()}`);
  }

  async getGreenWindows(zone: string, threshold: number): Promise<ApiResponse<GreenWindow[]>> {
    const params = new URLSearchParams();
    params.append('zone', zone);
    params.append('threshold', String(threshold));

    return this.request<GreenWindow[]>(`/windows?${params.toString()}`);
  }

  // ========================================================================
  // Activity Endpoints
  // ========================================================================

  async createTask(task: CreateTaskRequest): Promise<ApiResponse<Task>> {
    return this.request<Task>('/activities', {
      method: 'POST',
      body: JSON.stringify(task),
    });
  }

  async getTasks(page: number = 1, pageSize: number = 50): Promise<ApiResponse<PaginatedResponse<Task>>> {
    const params = new URLSearchParams();
    params.append('page', String(page));
    params.append('pageSize', String(pageSize));

    return this.request<PaginatedResponse<Task>>(`/activities?${params.toString()}`);
  }

  async getTask(id: string): Promise<ApiResponse<Task>> {
    return this.request<Task>(`/activities/${id}`);
  }

  async updateTask(id: string, update: UpdateTaskRequest): Promise<ApiResponse<Task>> {
    return this.request<Task>(`/activities/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(update),
    });
  }

  async deleteTask(id: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/activities/${id}`, {
      method: 'DELETE',
    });
  }

  // ========================================================================
  // Scheduling & Optimization Endpoints
  // ========================================================================

  async runScheduler(request: SchedulingRequest): Promise<ApiResponse<SchedulingResponse>> {
    return this.request<SchedulingResponse>('/scheduler', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async getEcoScore(taskId: string, currentIntensity: number, baselineIntensity: number, peakIntensity: number): Promise<ApiResponse<EcoScore>> {
    const params = new URLSearchParams();
    params.append('taskId', taskId);
    params.append('currentIntensity', String(currentIntensity));
    params.append('baselineIntensity', String(baselineIntensity));
    params.append('peakIntensity', String(peakIntensity));

    return this.request<EcoScore>(`/eco-score?${params.toString()}`);
  }

  // ========================================================================
  // Health & Configuration Endpoints
  // ========================================================================

  async health(): Promise<boolean> {
    if (!this.isBackendAvailable) return false;
    
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }

  async setSimulationConfig(config: Partial<SimulationConfig>): Promise<ApiResponse<SimulationConfig>> {
    return this.request<SimulationConfig>('/config/simulation', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  isAvailable(): boolean {
    return this.isBackendAvailable;
  }

  setAvailable(available: boolean): void {
    this.isBackendAvailable = available;
  }
}

export const apiClient = new ApiClient();

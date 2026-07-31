import type { ApiResponse } from '../types/domain';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api';

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE) {
    this.baseUrl = baseUrl;
  }

  async request<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    try {
      const response = await fetch(url, { ...options, headers });
      const json = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: json.error || json.detail || `HTTP ${response.status}: ${response.statusText}`,
          timestamp: new Date().toISOString(),
        };
      }

      // Backend returns either { success: true, data: T } or direct data object
      const data = json.data !== undefined ? json.data : json;

      return {
        success: true,
        data,
        timestamp: json.timestamp || new Date().toISOString(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Network error';
      return {
        success: false,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      };
    }
  }
}

export const apiClient = new ApiClient();

import type { ApiResponse } from '../types/domain';

export const UNAUTHORIZED_EVENT = 'ecotime:unauthorized';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api';

interface RawApiResponse {
  data?: unknown;
  error?: string;
  detail?: string;
  timestamp?: string;
  [key: string]: unknown;
}

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE) {
    this.baseUrl = baseUrl;
  }

  private getAuthHeader(): HeadersInit {
    const token = typeof window !== 'undefined' ? window.localStorage.getItem('ecotime_token') : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async request<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...this.getAuthHeader(),
      ...options.headers,
    };

    try {
      const response = await fetch(url, { ...options, headers });
      let json: RawApiResponse | null = null;
      try {
        json = (await response.json()) as RawApiResponse;
      } catch {
        json = null;
      }

      if (response.status === 401 && !endpoint.startsWith('/auth/')) {
        // Expired or invalid session: let the auth layer clear it and redirect to login.
        window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
      }

      if (!response.ok) {
        return {
          success: false,
          status: response.status,
          error: (json && (json.error || json.detail)) || `HTTP ${response.status}: ${response.statusText}`,
          timestamp: new Date().toISOString(),
        };
      }

      // Backend returns either { success: true, data: T } or direct data object
      const data = (json && json.data !== undefined ? json.data : json) as T;

      return {
        success: true,
        status: response.status,
        data,
        timestamp: (json && json.timestamp) || new Date().toISOString(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Network error';
      return {
        success: false,
        status: 0,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      };
    }
  }
}

export const apiClient = new ApiClient();

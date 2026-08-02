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

      let json: { success?: boolean; data?: unknown; error?: string; detail?: string; timestamp?: string };
      try {
        json = await response.json();
      } catch {
        // Response wasn't valid JSON (e.g. Flask's HTML debug traceback page,
        // or the dev server not running yet) — fail gracefully instead of
        // throwing a raw parse error the UI can't display sensibly.
        return {
          success: false,
          error: response.ok
            ? 'Received an unexpected (non-JSON) response from the server.'
            : `HTTP ${response.status}: ${response.statusText || 'Server error'}`,
          timestamp: new Date().toISOString(),
        };
      }

      if (!response.ok) {
        return {
          success: false,
          error: json.error || json.detail || `HTTP ${response.status}: ${response.statusText}`,
          timestamp: new Date().toISOString(),
        };
      }

      // Backend returns either { success: true, data: T } or direct data object
      const data = (json.data !== undefined ? json.data : json) as T;

      return {
        success: true,
        data,
        timestamp: json.timestamp || new Date().toISOString(),
      };
    } catch (error) {
      // fetch() itself threw — genuine network failure (server down, CORS
      // block, DNS/connection refused). This is the real "Failed to fetch".
      const errorMessage =
        error instanceof Error
          ? error.message === 'Failed to fetch'
            ? `Could not reach the backend at ${this.baseUrl}. Is the Flask server running?`
            : error.message
          : 'Network error';
      return {
        success: false,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      };
    }
  }
}

export const apiClient = new ApiClient();

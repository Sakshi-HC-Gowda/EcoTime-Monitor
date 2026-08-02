import { apiClient } from './apiClient';
import type {
  AnalyticsSummary,
  DashboardSummary,
  PaginatedResponse,
  ActivityHistoryRecord,
  RecommendationRecord,
  RecommendationStatus,
  StatusSummary,
  SystemStatus,
  ApiResponse,
} from '../types/domain';

export interface CarbonSnapshotRecord {
  id: number;
  activityId: string | null;
  region: string;
  carbonIntensity: number;
  forecast: unknown[];
  source: string;
  createdAt: string;
}

export const analyticsService = {
  async getAnalytics(zone: string = 'US-CA'): Promise<ApiResponse<AnalyticsSummary>> {
    const params = new URLSearchParams({ zone });
    return apiClient.request<AnalyticsSummary>(`/analytics?${params.toString()}`);
  },

  async getDashboard(zone: string = 'US-CA'): Promise<ApiResponse<DashboardSummary>> {
    const params = new URLSearchParams({ zone });
    return apiClient.request<DashboardSummary>(`/dashboard?${params.toString()}`);
  },

  async getHistory(
    page: number = 1,
    pageSize: number = 50,
    activityId?: string,
  ): Promise<ApiResponse<PaginatedResponse<ActivityHistoryRecord>>> {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (activityId) params.append('activityId', activityId);
    return apiClient.request<PaginatedResponse<ActivityHistoryRecord>>(`/history?${params.toString()}`);
  },

  async getRecommendations(
    page: number = 1,
    pageSize: number = 50,
    status?: RecommendationStatus,
  ): Promise<ApiResponse<PaginatedResponse<RecommendationRecord>>> {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (status) params.append('status', status);
    return apiClient.request<PaginatedResponse<RecommendationRecord>>(`/recommendations?${params.toString()}`);
  },

  async updateRecommendation(
    id: number,
    status: RecommendationStatus,
  ): Promise<ApiResponse<RecommendationRecord>> {
    return apiClient.request<RecommendationRecord>(`/recommendations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  async getStatus(): Promise<ApiResponse<StatusSummary>> {
    return apiClient.request<StatusSummary>('/status');
  },

  async setSystemStatus(isActive: boolean): Promise<ApiResponse<SystemStatus>> {
    return apiClient.request<SystemStatus>('/status', {
      method: 'POST',
      body: JSON.stringify({ isActive }),
    });
  },

  async getCarbonSnapshots(
    page: number = 1,
    pageSize: number = 50,
    region?: string,
  ): Promise<ApiResponse<PaginatedResponse<CarbonSnapshotRecord>>> {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (region) params.append('region', region);
    return apiClient.request<PaginatedResponse<CarbonSnapshotRecord>>(
      `/carbon-snapshots?${params.toString()}`,
    );
  },
};

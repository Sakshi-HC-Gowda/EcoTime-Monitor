import { apiClient } from './apiClient';
import type { ForecastResponse, ForecastModelInfo, ApiResponse } from '../types/domain';

export const forecastService = {
  async getForecast(zone: string = 'US-CA', hours: number = 24): Promise<ApiResponse<ForecastResponse>> {
    const params = new URLSearchParams({ zone, hours: String(hours) });
    return apiClient.request<ForecastResponse>(`/forecast?${params.toString()}`);
  },

  async getInfo(): Promise<ApiResponse<ForecastModelInfo>> {
    return apiClient.request<ForecastModelInfo>('/forecast/info');
  },

  async triggerTraining(hours: number = 4380, zone?: string): Promise<ApiResponse<{ message: string; hours_per_zone: number }>> {
    const body: { hours: number; zone?: string } = { hours };
    if (zone) body.zone = zone;

    return apiClient.request<{ message: string; hours_per_zone: number }>('/ml/train', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
};

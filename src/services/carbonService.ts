import { apiClient } from './apiClient';
import type { CarbonResponse, GreenWindow, GridZone, ApiResponse } from '../types/domain';

/** Carbon data is fetched exclusively via the Flask backend (never Electricity Maps directly). */
export const carbonService = {
  async getCarbonData(zone: string, offset: number = 0): Promise<ApiResponse<CarbonResponse>> {
    const params = new URLSearchParams({ zone, offset: String(offset) });
    return apiClient.request<CarbonResponse>(`/carbon?${params.toString()}`);
  },

  async getGreenWindows(zone: string, threshold: number = 180, offset: number = 0): Promise<ApiResponse<GreenWindow[]>> {
    const params = new URLSearchParams({
      zone,
      threshold: String(threshold),
      offset: String(offset),
    });
    return apiClient.request<GreenWindow[]>(`/windows?${params.toString()}`);
  },

  async getZones(): Promise<ApiResponse<GridZone[]>> {
    return apiClient.request<GridZone[]>('/zones');
  },
};

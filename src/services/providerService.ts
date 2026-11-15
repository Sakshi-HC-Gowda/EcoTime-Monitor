import { apiClient } from './apiClient';
import type { ApiResponse } from '@/types/domain';

export interface ElectricityMapsCredentialStatus {
  configured: boolean;
  source: 'organization' | 'environment' | 'none';
}

export const providerService = {
  async getElectricityMapsCredentialStatus(): Promise<ApiResponse<ElectricityMapsCredentialStatus>> {
    return apiClient.request<ElectricityMapsCredentialStatus>('/config/electricity-maps');
  },

  async saveElectricityMapsToken(token: string): Promise<ApiResponse<ElectricityMapsCredentialStatus>> {
    return apiClient.request<ElectricityMapsCredentialStatus>('/config/electricity-maps', {
      method: 'PUT',
      body: JSON.stringify({ token }),
    });
  },
};

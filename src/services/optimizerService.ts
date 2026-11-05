import { apiClient } from './apiClient';
import type {
  ApiResponse,
  EcoScore,
  PersistedOptimization,
  SchedulingRequest,
  SchedulingResponse,
  SimulationConfig,
} from '../types/domain';

export const optimizerService = {
  async getLatestOptimization(): Promise<ApiResponse<PersistedOptimization | null>> {
    return apiClient.request<PersistedOptimization | null>('/optimization/latest');
  },

  async runScheduler(request: SchedulingRequest): Promise<ApiResponse<SchedulingResponse>> {
    return apiClient.request<SchedulingResponse>('/recommendations', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  },

  async getEcoScore(taskId: string, currentIntensity: number, baselineIntensity: number = 380, peakIntensity: number = 800): Promise<ApiResponse<EcoScore>> {
    const params = new URLSearchParams({
      taskId,
      currentIntensity: String(currentIntensity),
      baselineIntensity: String(baselineIntensity),
      peakIntensity: String(peakIntensity),
    });
    return apiClient.request<EcoScore>(`/eco-score?${params.toString()}`);
  },

  async setSimulationConfig(config: Partial<SimulationConfig>): Promise<ApiResponse<SimulationConfig>> {
    return apiClient.request<SimulationConfig>('/config/simulation', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  },

  async getSimulationConfig(): Promise<ApiResponse<SimulationConfig>> {
    return apiClient.request<SimulationConfig>('/config/simulation');
  },
};

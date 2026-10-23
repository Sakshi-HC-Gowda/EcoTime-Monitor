import { apiClient } from './apiClient';
import type { AuthUser } from '@/features/auth/types';

export interface OrganizationMembersResponse {
  organizationId: number;
  members: AuthUser[];
  timestamp: string;
}

export const organizationService = {
  async getMembers(organizationId: number): Promise<OrganizationMembersResponse> {
    const response = await apiClient.request<OrganizationMembersResponse>(`/organizations/${organizationId}/members`);
    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to load organization members');
    }

    return response.data;
  },
};

import { apiClient } from './apiClient';
import type { AuthUser } from '@/features/auth/types';

export interface OrganizationMembersResponse {
  organizationId: number;
  members: AuthUser[];
  timestamp: string;
}

export interface OrganizationInvitation {
  id: string;
  organizationId: number;
  expiresAt: string;
  revokedAt: string | null;
  usedAt: string | null;
  createdAt: string;
  code?: string;
}

export const organizationService = {
  async getMembers(organizationId: number): Promise<OrganizationMembersResponse> {
    const response = await apiClient.request<OrganizationMembersResponse>(`/organizations/${organizationId}/members`);
    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to load organization members');
    }

    return response.data;
  },

  async createInvitation(
    organizationId: number,
    expiresInHours = 168,
  ): Promise<OrganizationInvitation> {
    const response = await apiClient.request<{ invitation: OrganizationInvitation }>(
      `/organizations/${organizationId}/invitations`,
      {
        method: 'POST',
        body: JSON.stringify({ expiresInHours }),
      },
    );
    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to create invitation');
    }
    return response.data.invitation;
  },

  async revokeInvitation(organizationId: number, invitationId: string): Promise<void> {
    const response = await apiClient.request(
      `/organizations/${organizationId}/invitations/${encodeURIComponent(invitationId)}/revoke`,
      { method: 'POST' },
    );
    if (!response.success) {
      throw new Error(response.error || 'Failed to revoke invitation');
    }
  },
};

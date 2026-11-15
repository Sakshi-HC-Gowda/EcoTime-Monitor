import { apiClient } from './apiClient';
import type { ApiResponse } from '@/types/domain';

export interface EcoPointTransaction {
  id: string;
  userId: string;
  organizationId: string | null;
  activityId: string | null;
  recommendationId: number | null;
  eventType: string;
  eventId: string;
  points: number;
  description: string | null;
  createdAt: string | null;
}

export interface SustainabilityScore {
  id: string;
  userId: string;
  organizationId: string | null;
  score: number;
  totalPoints: number;
  currentStreak: number;
  longestStreak: number;
  lastSustainableDate: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  leaderboardOptIn: boolean;
  globalLeaderboardOptIn: boolean;
}

export interface UserBadge {
  id: string;
  userId: string;
  organizationId: string | null;
  badgeType: string;
  name: string;
  description: string | null;
  earnedAt: string | null;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  score: number;
  totalPoints: number;
  currentStreak: number;
  longestStreak: number;
}

export interface EcoPointsResponse {
  userId: string;
  transactions: EcoPointTransaction[];
  totalTransactions: number;
}

export interface UserBadgesResponse {
  userId: string;
  badges: UserBadge[];
  totalBadges: number;
}

export interface OrganizationLeaderboardResponse {
  organizationId: string;
  leaderboard: LeaderboardEntry[];
  totalUsers: number;
}

export interface GlobalLeaderboardEntry {
  rank: number;
  organizationName: string;
  averageScore: number;
  averageEcoPoints: number;
  participatingMembers: number;
}

export interface GlobalLeaderboardResponse {
  leaderboard: GlobalLeaderboardEntry[];
  totalOrganizations: number;
}

export interface LeaderboardOptInResponse {
  userId: string;
  organizationId: string;
  leaderboardOptIn: boolean;
  message: string;
}

export interface GlobalLeaderboardOptInResponse {
  userId: string;
  globalLeaderboardOptIn: boolean;
  message: string;
}

export const sustainabilityService = {
  /**
   * Fetch sustainability score and streak info for the given user.
   */
  async getSustainabilityScore(userId: string | number): Promise<ApiResponse<SustainabilityScore>> {
    return apiClient.request<SustainabilityScore>(`/ecopoints/${encodeURIComponent(String(userId))}/score`);
  },

  /**
   * Fetch EcoPoint transaction ledger for the given user.
   */
  async getTransactions(userId: string | number): Promise<ApiResponse<EcoPointsResponse>> {
    return apiClient.request<EcoPointsResponse>(`/ecopoints/${encodeURIComponent(String(userId))}`);
  },

  /**
   * Fetch badges earned by the given user.
   */
  async getUserBadges(userId: string | number): Promise<ApiResponse<UserBadgesResponse>> {
    return apiClient.request<UserBadgesResponse>(`/badges/${encodeURIComponent(String(userId))}`);
  },

  /**
   * Fetch organization leaderboard rankings.
   */
  async getOrganizationLeaderboard(
    organizationId: string | number
  ): Promise<ApiResponse<OrganizationLeaderboardResponse>> {
    return apiClient.request<OrganizationLeaderboardResponse>(
      `/organizations/${encodeURIComponent(String(organizationId))}/leaderboard`
    );
  },

  /**
   * Update the user's leaderboard opt-in preference.
   */
  async setLeaderboardOptIn(
    organizationId: string | number,
    userId: string | number,
    enabled: boolean
  ): Promise<ApiResponse<LeaderboardOptInResponse>> {
    return apiClient.request<LeaderboardOptInResponse>(
      `/organizations/${encodeURIComponent(String(organizationId))}/leaderboard/opt-in`,
      {
        method: 'POST',
        body: JSON.stringify({
          userId: String(userId),
          enabled,
        }),
      }
    );
  },

  async getGlobalLeaderboard(): Promise<ApiResponse<GlobalLeaderboardResponse>> {
    return apiClient.request<GlobalLeaderboardResponse>('/leaderboard/global');
  },

  async setGlobalLeaderboardOptIn(
    enabled: boolean,
  ): Promise<ApiResponse<GlobalLeaderboardOptInResponse>> {
    return apiClient.request<GlobalLeaderboardOptInResponse>('/leaderboard/global/opt-in', {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    });
  },
};

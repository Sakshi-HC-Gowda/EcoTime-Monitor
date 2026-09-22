import { apiClient } from '@/services/apiClient';
import type { AuthSession, AuthUser } from './types';

const TOKEN_KEY = 'ecotime_token';
const USER_KEY = 'ecotime_user';

export const authService = {
  getToken(): string | null {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(TOKEN_KEY);
  },

  getStoredUser(): AuthUser | null {
    if (typeof window === 'undefined') return null;

    const raw = window.localStorage.getItem(USER_KEY);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  },

  setSession(session: AuthSession): void {
    if (typeof window === 'undefined') return;

    window.localStorage.setItem(TOKEN_KEY, session.token);
    window.localStorage.setItem(USER_KEY, JSON.stringify(session.user));
  },

  clearSession(): void {
    if (typeof window === 'undefined') return;

    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
  },

  async login(email: string, password: string): Promise<AuthSession> {
    const response = await apiClient.request<{ token: string; user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Login failed');
    }

    return {
      token: response.data.token,
      user: response.data.user,
    };
  },

  async register(payload: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    organization_name: string;
  }): Promise<AuthSession> {
    const response = await apiClient.request<{ token: string; user: AuthUser }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Registration failed');
    }

    return {
      token: response.data.token,
      user: response.data.user,
    };
  },

  async getCurrentUser(): Promise<AuthUser> {
    const response = await apiClient.request<AuthUser>('/users/me');
    if (!response.success || !response.data) {
      throw new Error(response.error || 'Unable to load user');
    }

    return response.data;
  },
};

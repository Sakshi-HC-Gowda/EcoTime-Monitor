/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authService } from './authService';
import type { AuthSession, AuthUser } from './types';

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<AuthSession>;
  register: (payload: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    organization_name: string;
  }) => Promise<AuthSession>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => authService.getStoredUser());
  const [token, setToken] = useState<string | null>(() => authService.getToken());
  const [isLoading, setIsLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    const storedToken = authService.getToken();

    if (!storedToken) {
      setUser(null);
      setToken(null);
      setIsLoading(false);
      return;
    }

    try {
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser);
      setToken(storedToken);
    } catch {
      authService.clearSession();
      setUser(null);
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshSession(), 0);
    return () => window.clearTimeout(timer);
  }, [refreshSession]);

  const login = useCallback(async (email: string, password: string) => {
    const session = await authService.login(email, password);
    authService.setSession(session);
    setUser(session.user);
    setToken(session.token);
    return session;
  }, []);

  const register = useCallback(async (payload: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    organization_name: string;
  }) => {
    const session = await authService.register(payload);
    authService.setSession(session);
    setUser(session.user);
    setToken(session.token);
    return session;
  }, []);

  const logout = useCallback(() => {
    authService.clearSession();
    setUser(null);
    setToken(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isLoading,
      isAuthenticated: Boolean(user && token),
      login,
      register,
      logout,
    }),
    [user, token, isLoading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}

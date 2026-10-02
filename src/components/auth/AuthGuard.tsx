import { Navigate, Outlet } from 'react-router-dom';

export const AUTH_STORAGE_KEY = 'ecotime_authenticated';

export function AuthGuard() {
  const isAuthenticated = localStorage.getItem(AUTH_STORAGE_KEY) === 'true';

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

export default AuthGuard;

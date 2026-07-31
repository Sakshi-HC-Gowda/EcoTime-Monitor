import { Outlet } from 'react-router-dom';

/**
 * LandingLayout — full-width, no sidebar.
 * Used exclusively for the marketing landing page.
 */
export function LandingLayout() {
  return (
    <div className="min-h-screen bg-bg-dark">
      <Outlet />
    </div>
  );
}

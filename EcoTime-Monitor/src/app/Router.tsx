import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '@/layouts/AppLayout';
import { LandingLayout } from '@/layouts/LandingLayout';
import { LandingPage } from '@/pages/Landing/LandingPage';
import { DashboardPage } from '@/pages/Dashboard/DashboardPage';
import { CarbonAnalyticsPage } from '@/pages/CarbonAnalytics/CarbonAnalyticsPage';
import { ForecastPage } from '@/pages/Forecast/ForecastPage';
import { GreenWindowsPage } from '@/pages/GreenWindows/GreenWindowsPage';
import { ActivitiesPage } from '@/pages/Activities/ActivitiesPage';
import { OptimizationPage } from '@/pages/Optimization/OptimizationPage';
import { SchedulerPage } from '@/pages/Scheduler/SchedulerPage';
import { SustainabilityPage } from '@/pages/Sustainability/SustainabilityPage';
import { SettingsPage } from '@/pages/Settings/SettingsPage';

export const router = createBrowserRouter([
  // Landing (marketing) — no sidebar
  {
    element: <LandingLayout />,
    children: [
      { path: '/', element: <LandingPage /> },
    ],
  },
  // App shell with sidebar
  {
    element: <AppLayout />,
    children: [
      { path: '/dashboard',    element: <DashboardPage /> },
      { path: '/carbon',       element: <CarbonAnalyticsPage /> },
      { path: '/forecast',     element: <ForecastPage /> },
      { path: '/windows',      element: <GreenWindowsPage /> },
      { path: '/activities',   element: <ActivitiesPage /> },
      { path: '/optimization', element: <OptimizationPage /> },
      { path: '/scheduler',    element: <SchedulerPage /> },
      { path: '/sustainability',element: <SustainabilityPage /> },
      { path: '/settings',     element: <SettingsPage /> },
      // Redirect any unknown /app/** to dashboard
      { path: '*', element: <Navigate to="/dashboard" replace /> },
    ],
  },
]);

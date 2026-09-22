import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from './Router';
import { ZoneProvider } from './ZoneProvider';
import { AuthProvider } from '@/features/auth/AuthProvider';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

export function Providers() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ZoneProvider>
          <RouterProvider router={router} />
        </ZoneProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

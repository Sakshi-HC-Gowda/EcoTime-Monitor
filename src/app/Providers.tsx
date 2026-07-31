import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from './Router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:          60_000,      // 1 minute
      gcTime:             5 * 60_000,  // 5 minutes
      retry:              2,
      refetchOnWindowFocus: false,
    },
  },
});

export function Providers() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

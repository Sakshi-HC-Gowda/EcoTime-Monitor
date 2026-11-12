import { AlertTriangle, RefreshCw } from 'lucide-react';
import { GlassCard } from './GlassCard';
import { Button } from './Button';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = 'Failed to load data',
  message = 'Please verify the EcoTime backend is running and reachable.',
  onRetry,
}: ErrorStateProps) {
  return (
    <GlassCard
      padding="lg"
      className="py-12 text-center border-rose-500/20 bg-rose-500/[0.02] flex flex-col items-center"
    >
      <div className="ds-icon-box mb-5 bg-rose-500/10 border-rose-500/20 text-rose-400">
        <AlertTriangle className="ds-icon-lg" />
      </div>
      <h3 className="card-title mb-2">{title}</h3>
      <p className="caption max-w-sm mb-6">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} iconLeft={<RefreshCw className="w-3.5 h-3.5" />}>
          Retry Connection
        </Button>
      )}
    </GlassCard>
  );
}

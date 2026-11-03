import React from 'react';
import { GlassCard } from './GlassCard';
import { Button } from './Button';

interface EmptyStateProps {
  icon: React.ElementType;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  accentColor?: 'green' | 'blue' | 'amber' | 'teal' | 'purple' | 'rose';
}

const accentMap = {
  green:  'bg-green-500/10 border-green-500/20 text-green-400',
  blue:   'bg-blue-500/10 border-blue-500/20 text-blue-400',
  amber:  'bg-amber-500/10 border-amber-500/20 text-amber-400',
  teal:   'bg-teal-500/10 border-teal-500/20 text-teal-400',
  purple: 'bg-purple-500/10 border-purple-500/20 text-purple-400',
  rose:   'bg-rose-500/10 border-rose-500/20 text-rose-400',
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  accentColor = 'green',
}: EmptyStateProps) {
  return (
    <GlassCard padding="lg" className="py-14 text-center flex flex-col items-center justify-center">
      <div
        className={`ds-icon-box !h-16 !w-16 mb-6 ${accentMap[accentColor]}`}
      >
        <Icon className="h-7 w-7" />
      </div>
      <h3 className="card-title mb-3">{title}</h3>
      <p className="caption max-w-md mb-8">{description}</p>
      {actionLabel && onAction && (
        <Button size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </GlassCard>
  );
}

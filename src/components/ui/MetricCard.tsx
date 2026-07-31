import React from 'react';
import { GlassCard } from './GlassCard';

interface MetricCardProps {
  title: string;
  value: string | number;
  unit?: string;
  subtitle?: string;
  icon: React.ElementType;
  iconColor?: string;
  iconBg?: string;
  accentClass?: string;
  trend?: {
    value: string;
    positive?: boolean;
  };
  onClick?: () => void;
}

export function MetricCard({
  title,
  value,
  unit,
  subtitle,
  icon: Icon,
  iconColor = 'text-green-400',
  iconBg = 'bg-green-500/10 border-green-500/20',
  accentClass = 'metric-accent-green',
  trend,
  onClick,
}: MetricCardProps) {
  return (
    <GlassCard
      onClick={onClick}
      hoverEffect={!!onClick}
      padding="md"
      className={`relative h-full min-h-[156px] overflow-hidden ${accentClass} ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div className="flex h-full items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="label-text mb-2">{title}</p>
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-[1.875rem] font-extrabold text-white tracking-tight leading-none md:text-[2rem]">{value}</span>
            {unit && <span className="text-xs font-medium text-slate-400">{unit}</span>}
          </div>
          {subtitle && (
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">{subtitle}</p>
          )}
          {trend && (
            <div
              className={`inline-flex items-center gap-1 mt-3 text-[11px] font-bold px-2.5 py-1 rounded-full ${
                trend.positive
                  ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
              }`}
            >
              <span>{trend.positive ? '↓' : '↑'} {trend.value}</span>
            </div>
          )}
        </div>

        <div className={`ds-icon-box ${iconBg} ${iconColor}`}>
          <Icon className="ds-icon-lg" />
        </div>
      </div>
    </GlassCard>
  );
}

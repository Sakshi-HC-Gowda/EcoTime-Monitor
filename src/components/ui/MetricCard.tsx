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
  iconColor = 'text-emerald-400',
  iconBg = 'bg-emerald-500/15 border-emerald-500/25',
  accentClass = '',
  trend,
  onClick,
}: MetricCardProps) {
  return (
    <GlassCard
      onClick={onClick}
      hoverEffect={!!onClick}
      padding="md"
      className={`relative h-full min-h-[180px] overflow-hidden ${accentClass} ${
        onClick ? 'cursor-pointer group' : ''
      }`}
    >
      <div className="flex h-full flex-col justify-between gap-4 p-0.5">
        <div className="flex items-start justify-between">
          <div
            className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 border shadow-md transition-transform duration-200 ${
              onClick ? 'group-hover:scale-105' : ''
            } ${iconBg} ${iconColor}`}
          >
            <Icon size={20} />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{title}</p>
        </div>

        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5 flex-nowrap overflow-hidden">
            <span className="text-[2rem] font-extrabold text-white tracking-tight leading-none whitespace-nowrap">
              {value}
            </span>

            {unit && (
              <span className="text-xs font-medium text-slate-400 whitespace-nowrap flex-shrink-0">
                {unit}
              </span>
            )}
          </div>

          {subtitle && (
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              {subtitle}
            </p>
          )}

          {trend && (
            <div className="mt-3">
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ${
                  trend.positive
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                }`}
              >
                {trend.positive ? '↑' : '↓'} {trend.value}
              </span>
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  );
}
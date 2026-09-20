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
      className={`relative h-full min-h-[140px] overflow-hidden p-5 flex flex-col justify-between transition-all duration-200 border border-white/[0.07] hover:border-emerald-500/30 ${accentClass} ${onClick ? 'cursor-pointer group' : ''}`}
    >
      <div className="flex items-start gap-3.5">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 border shadow-md transition-transform duration-200 group-hover:scale-105 ${iconBg} ${iconColor}`}>
          <Icon size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-slate-400 truncate mb-1">{title}</p>
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-none">{value}</span>
            {unit && <span className="text-xs font-semibold text-slate-400">{unit}</span>}
          </div>
          {subtitle && (
            <p className="text-[11px] text-slate-400 font-medium mt-1.5 leading-snug truncate">{subtitle}</p>
          )}
          {trend && (
            <div className="mt-2">
              <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                trend.positive
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
              }`}>
                {trend.positive ? '↑' : '↓'} {trend.value}
              </span>
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  );
}

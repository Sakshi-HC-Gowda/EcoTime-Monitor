import { Clock, Zap, Play, XCircle, Calendar, CalendarCheck2, Sparkles } from 'lucide-react';
import type { Task } from '@/types/domain';
import { GlassCard } from '@/components/ui/GlassCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import {
  formatRecommendedTime,
  getEstimatedCarbonImpact,
  getEstimatedEcoScore,
  getEstimatedEnergyKwh,
  getRecommendationText,
  getRecommendedStartTimeIso,
} from '@/features/activities/utils/activityMetrics';

interface Props {
  activity: Task;
  onUpdateStatus: (id: string, status: Task['status'], scheduledStartTime?: string) => void;
  onDelete: (id: string) => void;
}

const statusAccent: Record<string, string> = {
  running: 'border-t-green-500/40',
  completed: 'border-t-green-500/30',
  scheduled: 'border-t-amber-500/40',
  failed: 'border-t-rose-500/40',
  error: 'border-t-rose-500/40',
  pending: 'border-t-blue-500/30',
  idle: 'border-t-slate-500/20',
};

export function ActivityCard({ activity, onUpdateStatus, onDelete }: Props) {
  const estimatedPower = activity.powerDraw;
  const estimatedEnergy = getEstimatedEnergyKwh(activity);
  const estimatedCarbonImpact = getEstimatedCarbonImpact(activity);
  const ecoScore = getEstimatedEcoScore(activity);
  const recommendation = getRecommendationText(activity);
  const recommendedStartTime = getRecommendedStartTimeIso(activity);
  const recommendedDisplayTime = formatRecommendedTime(recommendedStartTime);

  const isHighCarbon = estimatedCarbonImpact > 200;
  const topBorderClass = statusAccent[activity.status.toLowerCase()] ?? 'border-t-white/[0.06]';
  const canAcceptRecommendation = activity.status === 'pending' && recommendation.toLowerCase().includes('schedule');

  return (
    <GlassCard
      hoverEffect
      className={`relative flex flex-col overflow-hidden border-t-2 ${topBorderClass}`}
      padding="none"
    >
      <div className="flex items-start justify-between p-[var(--card-padding-md)] pb-4">
        <div className="min-w-0 pr-3">
          <span className="label-text font-mono">{activity.activityType}</span>
          <h3 className="mt-0.5 text-[15px] font-bold leading-tight text-white">{activity.name}</h3>
        </div>
        <StatusBadge status={activity.status} />
      </div>

      <div className="grid grid-cols-2 gap-2 px-[var(--card-padding-md)] pb-4">
        <div className="ds-card p-2.5">
          <span className="label-text mb-1 block">Estimated Power</span>
          <span className="flex items-center gap-1.5 text-xs font-semibold text-white">
            <Clock className="h-3 w-3 flex-shrink-0 text-amber-400" />
            {estimatedPower.toFixed(0)} W
          </span>
        </div>

        <div className="ds-card p-2.5">
          <span className="label-text mb-1 block">Recommended Time</span>
          <span className="flex items-center gap-1.5 text-xs font-semibold text-white">
            <CalendarCheck2 className="h-3 w-3 flex-shrink-0 text-cyan-400" />
            {recommendedDisplayTime}
          </span>
        </div>

        <div className="ds-card p-2.5">
          <span className="label-text mb-1 block">Estimated Energy</span>
          <span className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
            <Zap className="h-3 w-3 flex-shrink-0 text-amber-400" />
            {estimatedEnergy.toFixed(2)} kWh
          </span>
        </div>

        <div className="ds-card p-2.5">
          <span className="label-text mb-1 block">Estimated Carbon Impact</span>
          <span className={`text-xs font-bold ${isHighCarbon ? 'text-rose-300' : 'text-green-300'}`}>
            {estimatedCarbonImpact.toFixed(0)} gCO2
          </span>
        </div>

        <div className="ds-card col-span-2 p-2.5">
          <div className="mb-1 flex items-center justify-between gap-3">
            <span className="label-text block">EcoScore</span>
            <span className="text-xs font-bold text-cyan-300">{ecoScore.toFixed(1)} / 100</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-cyan-400/80"
              style={{ width: `${Math.max(4, Math.min(100, ecoScore))}%` }}
            />
          </div>
          <span className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-slate-300">
            <Sparkles className="h-3 w-3 text-cyan-400" />
            {recommendation}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-white/[0.04] bg-white/[0.01] px-[var(--card-padding-md)] py-3.5">
        {canAcceptRecommendation && (
          <button
            onClick={() => onUpdateStatus(activity.id, 'scheduled', recommendedStartTime)}
            className="ds-control flex flex-1 items-center justify-center gap-1.5 bg-cyan-500/80 text-[12px] font-bold text-white shadow-sm shadow-cyan-500/20 hover:bg-cyan-500"
          >
            <CalendarCheck2 className="h-3 w-3" /> Accept Recommendation
          </button>
        )}

        {(activity.status === 'pending' || activity.status === 'scheduled') && (
          <button
            onClick={() => onUpdateStatus(activity.id, 'running')}
            className="ds-control flex flex-1 items-center justify-center gap-1.5 bg-green-500/80 text-[12px] font-bold text-white shadow-sm shadow-green-500/20 hover:bg-green-500"
          >
            <Play className="h-3 w-3" /> Run Now
          </button>
        )}

        {activity.status === 'pending' && (
          <button
            onClick={() => onUpdateStatus(activity.id, 'scheduled', recommendedStartTime)}
            className="ds-control flex flex-1 items-center justify-center gap-1.5 border border-white/[0.07] bg-white/[0.04] text-[12px] font-semibold text-slate-300 hover:bg-white/[0.08] hover:text-white"
          >
            <Calendar className="h-3 w-3" /> Schedule
          </button>
        )}

        <button
          onClick={() => onDelete(activity.id)}
          className="ds-control flex h-10 w-10 flex-shrink-0 items-center justify-center border border-transparent text-slate-600 hover:border-rose-500/20 hover:bg-rose-500/10 hover:text-rose-400"
          title="Cancel Activity"
          aria-label="Cancel Activity"
        >
          <XCircle className="h-4 w-4" />
        </button>
      </div>
    </GlassCard>
  );
}

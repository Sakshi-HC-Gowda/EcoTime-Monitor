import { Clock, Zap, Play, Pause, XCircle, Calendar } from 'lucide-react';
import type { Task } from '@/types/domain';
import { GlassCard } from '@/components/ui/GlassCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ScheduleModal } from '@/features/scheduler/components/ScheduleModal';
import { useSchedulerMutations } from '@/hooks/useScheduler';
import { useState } from 'react';

interface Props {
  activity: Task;
  onUpdateStatus: (id: string, status: Task['status']) => void;
  onDelete: (id: string) => void;
}

const statusAccent: Record<string, string> = {
  running: 'border-t-green-500/40',
  completed: 'border-t-green-500/30',
  scheduled: 'border-t-amber-500/40',
  delayed: 'border-t-amber-500/30',
  paused: 'border-t-amber-500/30',
  failed: 'border-t-rose-500/40',
  error: 'border-t-rose-500/40',
  pending: 'border-t-blue-500/30',
  idle: 'border-t-slate-500/20',
};

export function ActivityCard({ activity, onUpdateStatus, onDelete }: Props) {
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const { scheduleMutation } = useSchedulerMutations();

  const energy = activity.estimatedEnergyConsumption
    ? activity.estimatedEnergyConsumption.toFixed(2)
    : ((activity.powerDraw * activity.duration) / 60000).toFixed(2);

  const carbonGrams = parseFloat(energy) * 180;
  const carbonImpact = carbonGrams.toFixed(0);
  const isHighCarbon = carbonGrams > 200;
  const topBorderClass = statusAccent[activity.status.toLowerCase()] ?? 'border-t-white/[0.06]';

  const handleSchedule = async (data: { activityId: string; scheduledAt: string }) => {
    await scheduleMutation.mutateAsync({
      activityId: data.activityId,
      action: 'schedule',
      scheduledAt: data.scheduledAt,
    });
    setIsScheduleModalOpen(false);
  };

  return (
    <>
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
            <span className="label-text mb-1 block">Duration / Power</span>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-white">
              <Clock className="h-3 w-3 flex-shrink-0 text-amber-400" />
              {activity.duration}m / {activity.powerDraw}W
            </span>
          </div>

          <div className="ds-card p-2.5">
            <span className="label-text mb-1 block">Priority / Flex</span>
            <span className="text-xs font-semibold text-white">
              P:{activity.priorityScore} / F:{activity.flexibilityScore}%
            </span>
          </div>

          <div className="ds-card p-2.5">
            <span className="label-text mb-1 block">Energy</span>
            <span className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
              <Zap className="h-3 w-3 flex-shrink-0 text-amber-400" />
              {energy} kWh
            </span>
          </div>

          <div className="ds-card p-2.5">
            <span className="label-text mb-1 block">Carbon Impact</span>
            <span className={`text-xs font-bold ${isHighCarbon ? 'text-rose-300' : 'text-green-300'}`}>
              {carbonImpact} gCO2
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-white/[0.04] bg-white/[0.01] px-[var(--card-padding-md)] py-3.5">
          {activity.status !== 'running' && (
            <button
              onClick={() => onUpdateStatus(activity.id, 'running')}
              className="ds-control flex flex-1 items-center justify-center gap-1.5 bg-green-500/80 text-[12px] font-bold text-white shadow-sm shadow-green-500/20 hover:bg-green-500"
            >
              <Play className="h-3 w-3" /> Execute
            </button>
          )}

          {activity.status === 'running' && (
            <button
              onClick={() => onUpdateStatus(activity.id, 'paused')}
              className="ds-control flex flex-1 items-center justify-center gap-1.5 bg-amber-500/80 text-[12px] font-bold text-white hover:bg-amber-500"
            >
              <Pause className="h-3 w-3" /> Pause
            </button>
          )}

          {activity.status !== 'delayed' && activity.status !== 'completed' && (
            <button
              onClick={() => setIsScheduleModalOpen(true)}
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

      <ScheduleModal
        isOpen={isScheduleModalOpen}
        onClose={() => setIsScheduleModalOpen(false)}
        activity={activity}
        onSchedule={handleSchedule}
        isLoading={scheduleMutation.isPending}
      />
    </>
  );
}

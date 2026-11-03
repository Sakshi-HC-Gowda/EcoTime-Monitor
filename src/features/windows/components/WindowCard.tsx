import { Clock, Wind, ArrowRight } from 'lucide-react';
import type { GreenWindow } from '@/types/domain';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';

interface Props {
  window: GreenWindow;
  displayLabel?: string;
  onSchedule?: (window: GreenWindow) => void;
}

export function WindowCard({ window, displayLabel, onSchedule }: Props) {
  const startDate = new Date(window.startTime);
  const endDate = window.endTime
    ? new Date(window.endTime)
    : new Date(startDate.getTime() + window.duration * 60_000);
  const formatClockTime = (date: Date) => {
    const hours = date.getHours();
    const hour = hours % 12 || 12;
    return `${String(hour).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
  };
  const startTime = formatClockTime(startDate);
  const endTime = formatClockTime(endDate);
  const durationHours = Math.floor(window.duration / 60);
  const durationMinutes = window.duration % 60;

  const rank = window.rank || 1;
  const minCarbon = window.minCarbonIntensity || Math.round(window.avgCarbonIntensity * 0.85);

  return (
    <GlassCard padding="lg" hoverEffect className="relative flex h-full flex-col space-y-5 overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-8 h-8 rounded-full bg-teal-500/20 text-teal-400 text-sm font-extrabold flex items-center justify-center border border-teal-500/30 flex-shrink-0">
            #{rank}
          </span>
          <span className="text-sm font-bold text-white truncate">{displayLabel ?? 'Green Window'}</span>
        </div>

        <span className="ds-badge bg-teal-500/10 text-teal-400 border-teal-500/20 flex-shrink-0">
          {Math.round(window.carbonSavingPercent)}% lower than forecast peak
        </span>
      </div>

      <div className="flex-1 space-y-3 text-sm">
        <div className="card-inset">
          <span className="label-text mb-1 block">Available Time</span>
          <span className="font-semibold text-white flex items-center gap-1.5">
            <Clock className="ds-icon-md text-teal-400" /> {startTime} - {endTime}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="card-inset">
            <span className="label-text mb-1 block">Duration</span>
            <span className="font-semibold text-white block">{durationHours > 0 ? `${durationHours} hr ` : ''}{durationMinutes} min</span>
          </div>

          <div className="card-inset">
            <span className="label-text mb-1 block">Scheduled Activities</span>
            {window.scheduledActivityCount || window.scheduledDuration ? (
              <>
                <span className="font-semibold text-white block">
                  {window.scheduledActivityCount ?? 0} {window.scheduledActivityCount === 1 ? 'activity' : 'activities'}
                </span>
                <span className="mt-1 block text-xs text-teal-300">
                  {window.scheduledDuration ?? 0} min scheduled{window.remainingCapacity !== undefined ? ` · ${window.remainingCapacity} min remaining` : ''}
                </span>
              </>
            ) : (
              <span className="font-semibold text-slate-400">No activities scheduled yet</span>
            )}
          </div>
        </div>

        <div className="card-inset">
          <span className="label-text mb-1 block">Average / Minimum Carbon Intensity</span>
          <span className="font-bold text-teal-300 block text-lg">
            {Math.round(window.avgCarbonIntensity)} / {minCarbon} <span className="text-[10px] font-normal text-slate-400">gCO2e/kWh</span>
          </span>
        </div>

        <div className="card-inset border-emerald-500/10">
          <span className="label-text block mb-1">EcoScore</span>
          <span className="font-extrabold text-emerald-400 block text-xl">
            {window.userConvenience || 92} <span className="text-sm font-medium text-emerald-500/60">/ 100</span>
          </span>
        </div>
      </div>

      {onSchedule && (
        <Button
          type="button"
          variant="secondary"
          fullWidth
          size="md"
          onClick={() => onSchedule(window)}
          className="mt-auto border-teal-500/40 bg-teal-500/20 text-white hover:bg-teal-500/30 hover:border-teal-500/50"
          iconLeft={<Wind />}
          iconRight={<ArrowRight />}
        >
          Schedule Activity to Window
        </Button>
      )}
    </GlassCard>
  );
}

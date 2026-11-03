import type { GreenWindow } from '@/types/domain';
import { GlassCard } from '@/components/ui/GlassCard';
import { getGreenWindowLabel } from '@/features/windows/utils/windowLabels';

interface Props {
  windows: GreenWindow[];
}

export function WindowTimeline({ windows }: Props) {
  return (
    <GlassCard className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="card-title">Green Window Sequence Timeline</h3>
        <span className="caption">Chronological Detection</span>
      </div>

      <div className="relative border-l border-teal-500/30 ml-4 pl-6 space-y-6">
        {windows.map((w, idx) => {
          const startDate = new Date(w.startTime);
          const endDate = w.endTime
            ? new Date(w.endTime)
            : new Date(startDate.getTime() + w.duration * 60_000);
          const formatClockTime = (date: Date) => {
            const hours = date.getHours();
            const hour = hours % 12 || 12;
            return `${String(hour).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
          };
          return (
            <div key={w.id || idx} className="relative group">
              <span className="absolute -left-[31px] top-1.5 w-3.5 h-3.5 rounded-full bg-teal-400 ring-4 ring-slate-900" />
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <div>
                  <span className="text-xs text-teal-400 font-bold">{getGreenWindowLabel(idx)}</span>
                  <p className="text-xs text-white font-semibold">{formatClockTime(startDate)} – {formatClockTime(endDate)}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{Math.floor(w.duration / 60)} hr {w.duration % 60} min duration</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-green-400">{Math.round(w.carbonSavingPercent)}% lower than forecast peak</span>
                  <p className="text-[10px] text-slate-400">{Math.round(w.avgCarbonIntensity)} gCO2e/kWh avg</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}

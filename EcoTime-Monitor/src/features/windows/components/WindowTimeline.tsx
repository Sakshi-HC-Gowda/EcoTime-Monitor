import type { GreenWindow } from '@/types/domain';
import { GlassCard } from '@/components/ui/GlassCard';

interface Props {
  windows: GreenWindow[];
}

export function WindowTimeline({ windows }: Props) {
  return (
    <GlassCard className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-white">Green Window Sequence Timeline</h3>
        <span className="text-xs text-slate-400">Chronological Detection</span>
      </div>

      <div className="relative border-l border-teal-500/30 ml-4 pl-6 space-y-6">
        {windows.map((w, idx) => {
          const time = new Date(w.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          return (
            <div key={w.id || idx} className="relative group">
              <span className="absolute -left-[31px] top-1.5 w-3.5 h-3.5 rounded-full bg-teal-400 ring-4 ring-slate-900" />
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <div>
                  <span className="text-xs font-mono text-teal-400 font-bold">{w.id}</span>
                  <p className="text-xs text-white font-semibold">{time} ({w.duration} min duration)</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-green-400">-{Math.round(w.carbonSavingPercent)}% Carbon</span>
                  <p className="text-[10px] text-slate-400">{Math.round(w.avgCarbonIntensity)} gCO2/kWh avg</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}

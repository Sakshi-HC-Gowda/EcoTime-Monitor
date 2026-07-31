import { Clock, Wind, ArrowRight } from 'lucide-react';
import type { GreenWindow } from '@/types/domain';
import { GlassCard } from '@/components/ui/GlassCard';

interface Props {
  window: GreenWindow;
  onSchedule?: (window: GreenWindow) => void;
}

export function WindowCard({ window, onSchedule }: Props) {
  const startTime = new Date(window.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const endTime = window.endTime
    ? new Date(window.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '+ ' + window.duration + 'm';

  const rank = window.rank || 1;
  const minCarbon = window.minCarbonIntensity || Math.round(window.avgCarbonIntensity * 0.85);

  return (
    <GlassCard hoverEffect className="space-y-4 relative overflow-hidden">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-teal-500/20 text-teal-400 text-xs font-extrabold flex items-center justify-center border border-teal-500/30">
            #{rank}
          </span>
          <span className="text-xs font-mono font-bold text-white uppercase">{window.id}</span>
        </div>

        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-500/10 text-teal-400 border border-teal-500/20">
          -{Math.round(window.carbonSavingPercent)}% Carbon
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
          <span className="text-slate-400 block">Start - End Time</span>
          <span className="text-xs font-semibold text-white mt-1 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-teal-400" /> {startTime} - {endTime}
          </span>
        </div>

        <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
          <span className="text-slate-400 block">Window Duration</span>
          <span className="text-xs font-semibold text-white mt-1 block">{window.duration} Minutes</span>
        </div>

        <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
          <span className="text-slate-400 block">Avg / Min Carbon</span>
          <span className="text-xs font-bold text-teal-300 mt-1 block">
            {Math.round(window.avgCarbonIntensity)} / {minCarbon} <span className="text-[10px] font-normal text-slate-400">gCO2/kWh</span>
          </span>
        </div>

        <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
          <span className="text-slate-400 block">EcoScore</span>
          <span className="text-xs font-bold text-green-400 mt-1 block">{window.userConvenience || 92} / 100</span>
        </div>
      </div>

      {onSchedule && (
        <button
          onClick={() => onSchedule(window)}
          className="w-full py-2 rounded-xl text-xs font-semibold text-white bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/30 transition-colors flex items-center justify-center gap-2"
        >
          <Wind className="w-3.5 h-3.5" /> Schedule Activity to Window <ArrowRight className="w-3 h-3" />
        </button>
      )}
    </GlassCard>
  );
}

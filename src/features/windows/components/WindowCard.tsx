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
    <GlassCard padding="lg" hoverEffect className="space-y-6 relative overflow-hidden flex flex-col h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-full bg-teal-500/20 text-teal-400 text-sm font-extrabold flex items-center justify-center border border-teal-500/30">
            #{rank}
          </span>
          <span className="text-sm font-mono font-bold text-white uppercase">{window.id}</span>
        </div>

        <span className="px-3 py-1 rounded-full text-xs font-bold bg-teal-500/15 text-teal-300 border border-teal-500/20 shadow-inner">
          -{Math.round(window.carbonSavingPercent)}% Carbon
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm flex-1">
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]">
          <span className="text-slate-400 block text-xs mb-1">Start - End Time</span>
          <span className="font-semibold text-white flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-teal-400" /> {startTime} - {endTime}
          </span>
        </div>

        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]">
          <span className="text-slate-400 block text-xs mb-1">Window Duration</span>
          <span className="font-semibold text-white block">{window.duration} Minutes</span>
        </div>

        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]">
          <span className="text-slate-400 block text-xs mb-1">Avg / Min Carbon</span>
          <span className="font-bold text-teal-300 block text-lg">
            {Math.round(window.avgCarbonIntensity)} <span className="text-sm text-teal-500 font-medium">/ {minCarbon}</span> <span className="text-[11px] font-normal text-slate-500 ml-0.5">gCO₂</span>
          </span>
        </div>

        <div className="p-4 rounded-xl bg-white/[0.02] border border-emerald-500/10">
          <span className="text-slate-400 block text-xs mb-1">EcoScore</span>
          <span className="font-extrabold text-emerald-400 block text-xl">
            {window.userConvenience || 92} <span className="text-sm font-medium text-emerald-500/60">/ 100</span>
          </span>
        </div>
      </div>

      {onSchedule && (
        <button
          onClick={() => onSchedule(window)}
          className="w-full py-3.5 rounded-xl text-sm font-bold text-white bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/40 transition-colors flex items-center justify-center gap-2 mt-auto"
        >
          <Wind className="w-4 h-4" /> Schedule Activity to Window <ArrowRight className="w-4 h-4 ml-1" />
        </button>
      )}
    </GlassCard>
  );
}

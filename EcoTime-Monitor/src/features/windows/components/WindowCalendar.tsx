import type { GreenWindow } from '@/types/domain';
import { GlassCard } from '@/components/ui/GlassCard';

interface Props {
  windows: GreenWindow[];
}

export function WindowCalendar({ windows }: Props) {
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <GlassCard className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-white">24-Hour Calendar View</h3>
        <span className="text-xs text-slate-400">Green Window Schedule Grid</span>
      </div>

      <div className="grid grid-cols-6 sm:grid-cols-12 gap-2">
        {hours.map((h) => {
          const matchedWindow = windows.find((w) => new Date(w.startTime).getHours() === h);

          return (
            <div
              key={h}
              className={`p-3 rounded-xl border text-center transition-all ${
                matchedWindow
                  ? 'bg-teal-500/20 border-teal-500/40 text-teal-300 shadow-lg shadow-teal-500/10'
                  : 'bg-white/[0.02] border-white/[0.04] text-slate-500'
              }`}
            >
              <div className="text-[10px] font-mono">{h.toString().padStart(2, '0')}:00</div>
              <div className="text-xs font-bold mt-1">
                {matchedWindow ? `${Math.round(matchedWindow.avgCarbonIntensity)}g` : '-'}
              </div>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}

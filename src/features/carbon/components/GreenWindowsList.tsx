import { Clock, Wind } from 'lucide-react';
import type { GreenWindow } from '@/types/domain';

interface GreenWindowsListProps {
  windows: GreenWindow[];
}

export function GreenWindowsList({ windows }: GreenWindowsListProps) {
  if (windows.length === 0) {
    return (
      <p className="text-sm text-slate-500 py-2">
        No low-carbon windows detected in the current forecast.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {windows.map((win, index) => {
        const start = new Date(win.startTime).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });

        return (
          <li
            key={win.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2.5"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-6 h-6 rounded-full bg-teal-500/15 text-teal-400 text-[10px] font-extrabold flex items-center justify-center border border-teal-500/25 flex-shrink-0">
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-white flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-teal-400 flex-shrink-0" />
                  {start}
                  <span className="text-slate-500 font-normal">· {win.duration} min</span>
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Avg {Math.round(win.avgCarbonIntensity)} gCO₂/kWh
                </p>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-[13px] font-bold text-teal-300 flex items-center gap-1 justify-end">
                <Wind className="w-3 h-3" />
                -{Math.round(win.carbonSavingPercent)}%
              </p>
              <p className="text-[10px] text-slate-500">{win.id}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

import { Clock, Wind } from 'lucide-react';
import type { GreenWindow } from '@/types/domain';
import { getGreenWindowLabel } from '@/features/windows/utils/windowLabels';

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
        const startDate = new Date(win.startTime);
        const endDate = win.endTime
          ? new Date(win.endTime)
          : new Date(startDate.getTime() + win.duration * 60_000);
        const formatClockTime = (date: Date) => {
          const hours = date.getHours();
          const hour = hours % 12 || 12;
          return `${String(hour).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
        };
        const start = formatClockTime(startDate);
        const end = formatClockTime(endDate);

        return (
          <li
            key={win.id}
            className="grid gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-6 h-6 rounded-full bg-teal-500/15 text-teal-400 text-[10px] font-extrabold flex items-center justify-center border border-teal-500/25 flex-shrink-0">
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-white flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-teal-400 flex-shrink-0" />
                  {start} – {end}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {Math.floor(win.duration / 60)} hr {win.duration % 60} min · Average {Math.round(win.avgCarbonIntensity)} gCO₂e/kWh
                </p>
              </div>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-[13px] font-bold text-teal-300 flex items-center gap-1 sm:justify-end">
                <Wind className="w-3 h-3" />
                {Math.round(win.carbonSavingPercent)}% lower than forecast peak
              </p>
              <p className="mt-1 text-[10px] text-slate-500">{getGreenWindowLabel(index)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

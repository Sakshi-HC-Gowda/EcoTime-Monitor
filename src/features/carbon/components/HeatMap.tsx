import type { CarbonDataPoint } from '@/types/domain';

interface Props {
  forecast: CarbonDataPoint[];
}

export function HeatMap({ forecast }: Props) {
  const points = forecast.slice(0, 24);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>24-Hour Intensity Heatmap</span>
        <span className="text-green-400 font-semibold">Green Troughs Highlighted</span>
      </div>

      <div className="grid grid-cols-6 sm:grid-cols-12 gap-2">
        {points.map((pt, idx) => {
          const val = pt.carbonIntensity;
          const timeStr = new Date(pt.datetime).getHours() + ':00';

          let bg = 'bg-green-500/20 text-green-300 border-green-500/30';
          if (val > 280) {
            bg = 'bg-rose-500/20 text-rose-300 border-rose-500/30';
          } else if (val > 180) {
            bg = 'bg-amber-500/20 text-amber-300 border-amber-500/30';
          }

          return (
            <div
              key={idx}
              className={`p-2.5 rounded-xl border text-center font-mono ${bg} transition-transform hover:scale-105`}
            >
              <div className="text-[10px] opacity-75">{timeStr}</div>
              <div className="text-xs font-bold mt-0.5">{Math.round(val)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

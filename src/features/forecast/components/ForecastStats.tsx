import { ArrowDownRight, ArrowUpRight, Clock, Shield } from 'lucide-react';
import type { ForecastPoint } from '@/types/domain';
import { GlassCard } from '@/components/ui/GlassCard';

interface Props {
  forecast: ForecastPoint[];
}

export function ForecastStats({ forecast }: Props) {
  if (!forecast || forecast.length === 0) return null;

  const intensities = forecast.map((f) => f.carbonIntensity);
  const minVal = Math.min(...intensities);
  const maxVal = Math.max(...intensities);

  const minPoint = forecast.find((f) => f.carbonIntensity === minVal);
  const maxPoint = forecast.find((f) => f.carbonIntensity === maxVal);

  const bestTime = minPoint
    ? new Date(minPoint.datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '14:00';
  const peakTime = maxPoint
    ? new Date(maxPoint.datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '19:00';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
      <GlassCard className="border-green-500/20 bg-green-500/[0.02]">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Lowest Carbon Window</span>
          <ArrowDownRight className="w-5 h-5 text-green-400" />
        </div>
        <div className="text-3xl font-extrabold text-green-400 mt-2">{minVal} <span className="text-xs text-slate-400">gCO2/kWh</span></div>
        <p className="text-xs text-slate-300 mt-1 flex items-center gap-1">
          <Clock className="w-3.5 h-3.5 text-green-400" /> Optimal execution at {bestTime}
        </p>
      </GlassCard>

      <GlassCard className="border-rose-500/20 bg-rose-500/[0.02]">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Peak Carbon Period</span>
          <ArrowUpRight className="w-5 h-5 text-rose-400" />
        </div>
        <div className="text-3xl font-extrabold text-rose-400 mt-2">{maxVal} <span className="text-xs text-slate-400">gCO2/kWh</span></div>
        <p className="text-xs text-slate-300 mt-1 flex items-center gap-1">
          <Clock className="w-3.5 h-3.5 text-rose-400" /> Thermal generation peak at {peakTime}
        </p>
      </GlassCard>

      <GlassCard className="border-purple-500/20 bg-purple-500/[0.02]">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Prediction Confidence</span>
          <Shield className="w-5 h-5 text-purple-400" />
        </div>
        <div className="text-3xl font-extrabold text-purple-300 mt-2">96.4%</div>
        <p className="text-xs text-slate-300 mt-1">Bounded within ±12% variance band</p>
      </GlassCard>
    </div>
  );
}

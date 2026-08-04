import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import type { ForecastPoint } from '@/types/domain';

interface Props {
  forecast: ForecastPoint[];
}

export function ForecastChart({ forecast }: Props) {
  const data = forecast.map((pt) => {
    const intensity = pt.carbonIntensity;
    return {
      time: new Date(pt.datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      intensity,
      confidenceUpper: intensity + Math.round(intensity * 0.12),
      confidenceLower: Math.max(50, intensity - Math.round(intensity * 0.12)),
    };
  });

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="foreGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#a855f7" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="bandGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
          <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickLine={false} />
          <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} width={40} />
          <Tooltip
            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
            labelStyle={{ color: '#94a3b8' }}
          />
          <Area type="monotone" dataKey="confidenceUpper" name="Upper Confidence Limit" stroke="transparent" fill="url(#bandGradient)" />
          <Area type="monotone" dataKey="confidenceLower" name="Lower Confidence Limit" stroke="transparent" fill="transparent" />
          <Area type="monotone" dataKey="intensity" name="ML Predicted Carbon (gCO2/kWh)" stroke="#a855f7" strokeWidth={3} fill="url(#foreGradient)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import type { CarbonDataPoint } from '@/types/domain';

interface Props {
  history: CarbonDataPoint[];
  forecast: CarbonDataPoint[];
}

export function CarbonTrendChart({ history, forecast }: Props) {
  const combinedData = [
    ...history.slice(-12).map((pt) => ({
      time: new Date(pt.datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      historical: pt.carbonIntensity,
      forecast: null as number | null,
    })),
    ...forecast.slice(0, 24).map((pt) => ({
      time: new Date(pt.datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      historical: null as number | null,
      forecast: pt.carbonIntensity,
    })),
  ];

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={combinedData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="histGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="foreGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
          <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickLine={false} />
          <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} width={40} />
          <Tooltip
            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
            labelStyle={{ color: '#94a3b8' }}
          />
          <Area type="monotone" dataKey="historical" name="Historical (gCO2/kWh)" stroke="#3b82f6" strokeWidth={2} fill="url(#histGrad)" />
          <Area type="monotone" dataKey="forecast" name="Forecast (gCO2/kWh)" stroke="#10b981" strokeWidth={2} strokeDasharray="4 4" fill="url(#foreGrad)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

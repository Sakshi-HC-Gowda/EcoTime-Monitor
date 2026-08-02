import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import type { CarbonDataPoint } from '@/types/domain';

interface Props {
  forecast: CarbonDataPoint[];
}

export function HourlyTimeline({ forecast }: Props) {
  const data = forecast.slice(0, 24).map((pt) => ({
    hour: new Date(pt.datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    intensity: pt.carbonIntensity,
  }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <XAxis dataKey="hour" stroke="#64748b" fontSize={10} tickLine={false} />
          <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
          />
          <Bar dataKey="intensity" radius={[6, 6, 0, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.intensity < 180 ? '#10b981' : entry.intensity < 280 ? '#f59e0b' : '#f43f5e'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

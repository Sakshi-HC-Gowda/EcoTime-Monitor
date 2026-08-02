import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';

const regionsData = [
  { region: 'US-CA', intensity: 145, renewable: 62 },
  { region: 'US-NY', intensity: 220, renewable: 45 },
  { region: 'DE', intensity: 310, renewable: 38 },
  { region: 'FR', intensity: 85, renewable: 88 },
  { region: 'GB', intensity: 195, renewable: 52 },
];

export function RegionComparison() {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={regionsData} layout="vertical">
          <XAxis type="number" stroke="#64748b" fontSize={10} tickLine={false} />
          <YAxis dataKey="region" type="category" stroke="#64748b" fontSize={11} tickLine={false} />
          <Tooltip
            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
          />
          <Bar dataKey="intensity" name="Carbon Intensity (gCO2/kWh)" fill="#3b82f6" radius={[0, 6, 6, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

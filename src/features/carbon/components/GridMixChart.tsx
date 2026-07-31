import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';

const mixData = [
  { name: 'Solar', value: 38, color: '#f59e0b' },
  { name: 'Wind', value: 24, color: '#10b981' },
  { name: 'Nuclear', value: 18, color: '#a855f7' },
  { name: 'Hydro', value: 12, color: '#3b82f6' },
  { name: 'Gas / Coal', value: 8, color: '#f43f5e' },
];

export function GridMixChart() {
  return (
    <div className="flex flex-col sm:flex-row items-center justify-around gap-6 h-64">
      <div className="h-56 w-56">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={mixData}
              innerRadius={55}
              outerRadius={80}
              paddingAngle={4}
              dataKey="value"
            >
              {mixData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="space-y-2 text-xs">
        <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider block mb-2">Power Sources</span>
        {mixData.map((item) => (
          <div key={item.name} className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="text-slate-300 font-medium w-24">{item.name}</span>
            <span className="text-white font-bold">{item.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

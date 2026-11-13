import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FlaskConical, Info, TrendingDown } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { useForecast } from '@/features/forecast/hooks/useForecast';
import {
  analyseActivity,
  formatGrams,
  isMovable,
  type StartOption,
} from '@/features/optimization/utils/whatIf';
import type { Task } from '@/types/domain';

interface Props {
  activities: Task[];
  zone: string | null;
}

const HORIZON_HOURS = 48;

const timeLabel = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

const sourceLabel = (source?: string) => {
  switch (source) {
    case 'electricity_maps_api': return 'Electricity Maps forecast';
    case 'electricity_maps_api+ml_model': return 'Electricity Maps + trained model';
    case 'ml_model': return 'Trained ML model';
    case 'simulation': return 'Simulated data';
    default: return source ?? 'Forecast';
  }
};

export function WhatIfPlanner({ activities, zone }: Props) {
  const { data: forecast, isLoading, isError } = useForecast(zone ?? 'US-CA', HORIZON_HOURS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [chosenByActivity, setChosenByActivity] = useState<Record<string, number>>({});

  const analyses = useMemo(() => {
    if (!forecast) return new Map<string, ReturnType<typeof analyseActivity>>();
    return new Map(activities.map((task) => [task.id, analyseActivity(forecast.forecast, task)]));
  }, [forecast, activities]);

  const movable = activities.filter(isMovable);
  const fleet = movable.reduce(
    (total, task) => {
      const a = analyses.get(task.id);
      if (!a?.baseline || !a.best) return total;
      return { baseline: total.baseline + a.baseline.grams, best: total.best + a.best.grams, count: total.count + 1 };
    },
    { baseline: 0, best: 0, count: 0 },
  );

  if (!zone) return null;

  const header = (
    <div className="mb-4 flex items-start gap-3">
      <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
      <div>
        <h2 className="text-base font-semibold text-white">What-if planner</h2>
        <p className="mt-1 text-xs text-slate-500">
          Pick an activity and slide its start time to see the estimated emissions at every hour of the forecast.
        </p>
      </div>
    </div>
  );

  if (isLoading) {
    return <GlassCard>{header}<p className="text-sm text-slate-400">Loading forecast…</p></GlassCard>;
  }
  if (isError || !forecast) {
    return <GlassCard>{header}<p className="text-sm text-amber-300">The forecast is unavailable, so the what-if view cannot be calculated right now.</p></GlassCard>;
  }
  if (activities.length === 0) {
    return <GlassCard>{header}<p className="text-sm text-slate-400">Add an activity to explore when it would be cleanest to run.</p></GlassCard>;
  }

  const task = activities.find((a) => a.id === selectedId) ?? movable[0] ?? activities[0];
  const analysis = analyses.get(task.id);
  const options = analysis?.options ?? [];
  const bestPos = analysis?.best ? options.findIndex((o) => o.index === analysis.best!.index) : 0;
  const stored = chosenByActivity[task.id];
  const chosenPos = Math.min(Math.max(stored ?? bestPos, 0), Math.max(options.length - 1, 0));
  const chosen: StartOption | undefined = options[chosenPos];
  const canMove = isMovable(task);

  const delta = (option?: StartOption) => {
    if (!option || !analysis?.baseline || analysis.baseline.grams === 0) return null;
    return ((analysis.baseline.grams - option.grams) / analysis.baseline.grams) * 100;
  };
  const chartData = options.map((option, i) => ({
    key: i,
    label: timeLabel(option.start),
    grams: Number(option.grams.toFixed(2)),
    isBaseline: i === 0,
    isBest: option.index === analysis?.best?.index,
    isChosen: i === chosenPos,
  }));

  return (
    <GlassCard>
      {header}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label htmlFor="whatif-activity" className="text-xs text-slate-400">Activity</label>
        <select
          id="whatif-activity"
          value={task.id}
          onChange={(event) => setSelectedId(event.target.value)}
          className="rounded-lg border border-white/10 bg-[#070c16] px-3 py-2 text-sm text-white"
        >
          {activities.map((a) => (
            <option key={a.id} value={a.id}>{a.name} · {a.duration} min · {a.powerDraw} W</option>
          ))}
        </select>
        <span className="text-xs text-slate-500">{sourceLabel(forecast.forecastSource ?? forecast.source)}</span>
      </div>

      {!canMove && (
        <p className="mb-4 flex items-start gap-2 text-xs text-amber-300">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          This activity is inflexible or urgent (priority 80+), so the optimizer will not delay it. The chart shows what a delay would
          change, for comparison only.
        </p>
      )}

      {options.length === 0 || !analysis?.baseline || !analysis.best || !chosen ? (
        <p className="text-sm text-slate-400">
          No start time in the next {HORIZON_HOURS} hours fits this activity’s duration, earliest start and deadline.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Outcome tone="amber" title="Run as soon as allowed" option={analysis.baseline} />
            <Outcome tone="blue" title="Your choice" option={chosen} saving={delta(chosen)} />
            <Outcome tone="green" title="Cleanest start" option={analysis.best} saving={delta(analysis.best)} />
          </div>

          <div className="mt-5">
            <label htmlFor="whatif-slider" className="text-xs text-slate-400">
              Start time: <span className="font-medium text-white">{timeLabel(chosen.start)}</span>
            </label>
            <input
              id="whatif-slider"
              type="range"
              min={0}
              max={options.length - 1}
              value={chosenPos}
              onChange={(event) => setChosenByActivity((c) => ({ ...c, [task.id]: Number(event.target.value) }))}
              className="mt-2 w-full accent-green-500"
            />
            <div className="mt-1 flex gap-3">
              <button type="button" className="text-xs text-green-400 hover:underline"
                onClick={() => setChosenByActivity((c) => ({ ...c, [task.id]: bestPos }))}>
                Jump to cleanest
              </button>
              <button type="button" className="text-xs text-slate-400 hover:underline"
                onClick={() => setChosenByActivity((c) => ({ ...c, [task.id]: 0 }))}>
                Jump to earliest
              </button>
            </div>
          </div>

          <div className="mt-4 h-56 w-full" aria-label="Estimated emissions by start time">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                onClick={(state) => {
                  const idx = Number(state?.activeTooltipIndex);
                  if (Number.isInteger(idx)) setChosenByActivity((c) => ({ ...c, [task.id]: idx }));
                }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                <XAxis dataKey="label" stroke="#64748b" fontSize={10} tickLine={false} interval="preserveStartEnd" minTickGap={28} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} width={44} />
                <Tooltip
                  contentStyle={{ background: '#0b1220', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                  formatter={(value) => [`${value} gCO₂e`, 'Estimated emissions']}
                />
                <Bar dataKey="grams" radius={[3, 3, 0, 0]} cursor="pointer">
                  {chartData.map((d) => (
                    <Cell key={d.key}
                      fill={d.isChosen ? '#3b82f6' : d.isBest ? '#22c55e' : d.isBaseline ? '#f59e0b' : '#475569'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {fleet.count > 0 && (
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-green-500/15 bg-green-500/[0.06] p-4">
          <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
          <div className="text-sm text-slate-300">
            <p>
              Across your {fleet.count} movable {fleet.count === 1 ? 'activity' : 'activities'}, running each at its cleanest start
              instead of as soon as allowed would cut estimated emissions from{' '}
              <span className="font-semibold text-white">{formatGrams(fleet.baseline)}</span> to{' '}
              <span className="font-semibold text-green-300">{formatGrams(fleet.best)}</span>
              {fleet.baseline > 0 && <> ({(((fleet.baseline - fleet.best) / fleet.baseline) * 100).toFixed(1)}% lower)</>}.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Upper bound: it treats each activity separately. The optimizer above also respects window capacity and avoids overlaps.
            </p>
          </div>
        </div>
      )}

      <p className="mt-4 text-[11px] leading-5 text-slate-500">
        Estimates use assumed power and duration with forecast carbon intensity. They are planning figures, not measured savings.
      </p>
    </GlassCard>
  );
}

function Outcome({
  tone, title, option, saving,
}: { tone: 'amber' | 'blue' | 'green'; title: string; option: StartOption; saving?: number | null }) {
  const color = { amber: 'text-amber-300', blue: 'text-blue-300', green: 'text-green-300' }[tone];
  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#070c16]/80 p-4">
      <p className={`text-xs font-medium ${color}`}>{title}</p>
      <p className="mt-2 text-xl font-semibold text-white">{formatGrams(option.grams)}</p>
      <p className="mt-1 text-xs text-slate-400">
        {timeLabel(option.start)} · avg {Math.round(option.avgIntensity)} gCO₂e/kWh
      </p>
      {saving != null && Math.abs(saving) >= 0.05 && (
        <p className={`mt-1 text-xs font-medium ${saving > 0 ? 'text-green-400' : 'text-red-400'}`}>
          {saving > 0 ? `${saving.toFixed(1)}% lower` : `${Math.abs(saving).toFixed(1)}% higher`} than running as soon as allowed
        </p>
      )}
    </div>
  );
}

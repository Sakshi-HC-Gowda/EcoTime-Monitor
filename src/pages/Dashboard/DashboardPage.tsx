import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  Leaf,
  Zap,
  Wind,
  Globe,
  TrendingUp,
  Brain,
  Plus,
  ArrowRight,
  ShieldCheck,
  Calendar,
  ListFilter,
} from 'lucide-react';

import { useCarbon, useGreenWindows } from '@/features/carbon/hooks/useCarbon';
import { useZone } from '@/app/ZoneProvider';
import { GreenWindowsList } from '@/features/carbon/components/GreenWindowsList';
import { useActivitiesQuery } from '@/features/activities/hooks/useActivitiesQuery';
import { GlassCard } from '@/components/ui/GlassCard';
import { MetricCard } from '@/components/ui/MetricCard';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { StatusBadge } from '@/components/ui/StatusBadge';

type CustomTooltipProps = {
  active?: boolean;
  payload?: readonly { value?: number | string | readonly (number | string)[] }[];
  label?: string | number;
};

// ─── Custom recharts tooltip ─────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const raw = payload[0]?.value as number | string | readonly (number | string)[] | undefined;
  const display = Array.isArray(raw) ? raw[0] : raw;

  return (
    <div className="bg-[#0c1322] border border-white/[0.12] rounded-xl px-3.5 py-2.5 shadow-2xl text-xs">
      <p className="text-slate-400 mb-1 font-medium">{label}</p>
      <p className="text-purple-400 font-bold">{display} <span className="text-slate-500 font-normal">gCO₂/kWh</span></p>
    </div>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { selectedZone } = useZone();

  const { data: carbon, isLoading: carbonLoading, isError: carbonError, refetch: refetchCarbon } = useCarbon(selectedZone);
  const { data: windows, isLoading: windowsLoading } = useGreenWindows(selectedZone, 180);
  const { data: activitiesData, isLoading: activitiesLoading } = useActivitiesQuery(1, 10);

  if (carbonLoading || windowsLoading) {
    return (
      <div className="page-shell page-stack p-6 space-y-6">
        <LoadingSkeleton count={1} height="h-24" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <LoadingSkeleton count={4} height="h-32" />
        </div>
        <LoadingSkeleton count={2} height="h-64" />
      </div>
    );
  }

  if (carbonError || !carbon) {
    return (
      <div className="page-shell p-6">
        <ErrorState onRetry={() => refetchCarbon()} />
      </div>
    );
  }

  const currentIntensity = carbon.current.carbonIntensity;
  const isLow = currentIntensity < 180;

  const activities = activitiesData?.items ?? [];
  const greenWindows = windows ?? [];

  let pendingCount = 0;
  let scheduledCount = 0;
  let runningCount = 0;
  let completedCount = 0;

  for (const task of activities) {
    if (task.status === 'pending') pendingCount += 1;
    else if (task.status === 'scheduled') scheduledCount += 1;
    else if (task.status === 'running') runningCount += 1;
    else if (task.status === 'completed') completedCount += 1;
  }

  const activeTasksCount = runningCount;
  const totalTasksCount = activitiesData?.total || 0;

  // Forecast chart data — next 24 hours
  const forecastData = carbon.forecast.slice(0, 24).map((pt) => ({
    time: new Date(pt.datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    intensity: pt.carbonIntensity,
  }));

  // EcoScore calculation
  const ecoScore = Math.max(10, Math.min(99, Math.round(100 - (currentIntensity / 400) * 100)));

  // Donut chart data for Activity Lifecycle
  const pieData = [
    { name: 'Pending', value: pendingCount || 1, color: '#3b82f6' },
    { name: 'Scheduled', value: scheduledCount || 0, color: '#f59e0b' },
    { name: 'Running', value: runningCount || 0, color: '#10b981' },
    { name: 'Completed', value: completedCount || 0, color: '#64748b' },
  ];

  const todayDateString = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="page-shell p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1680px] mx-auto">

      {/* ── Top Header Greeting Banner ───────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 p-6 sm:p-7 rounded-2xl bg-gradient-to-r from-[#0b1424] via-[#09111e] to-[#070c14] border border-white/[0.07] shadow-xl backdrop-blur-md">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
            Good Evening, Sakshi! <span className="inline-block animate-pulse">👋</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 font-medium">
            Let's make your digital work greener today.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Date Indicator Pill */}
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/[0.07] text-xs font-semibold text-slate-300">
            <Calendar size={14} className="text-slate-400" />
            <span>{todayDateString}</span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400">Karnataka, India ({selectedZone})</span>
          </div>

          {/* Live Monitoring Badge Pill */}
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-bold shadow-sm">
            <div className="w-6 h-6 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <Leaf size={14} className="text-emerald-400" />
            </div>
            <span>Live Monitoring</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="text-slate-400 font-normal">Grid: {selectedZone}</span>
          </div>
        </div>
      </div>

      {/* ── Stat Cards Row ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <MetricCard
          title="Current Carbon"
          value={currentIntensity}
          unit="gCO₂/kWh"
          subtitle={isLow ? 'Below threshold — optimal' : 'Above threshold — moderate'}
          icon={Zap}
          iconColor="text-amber-400"
          iconBg="bg-amber-500/15 border-amber-500/30"
          trend={{ value: '12% vs yesterday', positive: false }}
          onClick={() => navigate('/carbon')}
        />
        <MetricCard
          title="EcoScore"
          value={`${ecoScore} / 100`}
          subtitle="Optimization rating"
          icon={Leaf}
          iconColor="text-emerald-400"
          iconBg="bg-emerald-500/15 border-emerald-500/30"
          onClick={() => navigate('/optimization')}
        />
        <MetricCard
          title="Carbon Saved"
          value="4.82"
          unit="kg CO₂"
          subtitle="Cumulative via scheduling"
          icon={Leaf}
          iconColor="text-emerald-400"
          iconBg="bg-emerald-500/15 border-emerald-500/30"
          onClick={() => navigate('/sustainability')}
        />
        <MetricCard
          title="Active Workloads"
          value={`${activeTasksCount} / ${totalTasksCount}`}
          unit="total"
          subtitle={`P:${pendingCount} S:${scheduledCount} R:${runningCount} C:${completedCount}`}
          icon={ListFilter}
          iconColor="text-blue-400"
          iconBg="bg-blue-500/15 border-blue-500/30"
          onClick={() => navigate('/activities')}
        />
      </div>

      {/* ── Main Content Grid ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Left Column (8 cols) */}
        <div className="lg:col-span-8 space-y-6">

          {/* Live Carbon Forecast Chart */}
          <GlassCard hoverEffect onClick={() => navigate('/forecast')} className="cursor-pointer group p-6">
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                  <h3 className="text-base font-bold text-white">Live Carbon Forecast</h3>
                </div>
                <p className="text-xs text-slate-400">
                  Predicted grid intensity for {selectedZone} — next 24 hours
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-400 group-hover:text-purple-300 transition-colors">
                View Full Forecast <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </div>

            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={forecastData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="purpleGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a855f7" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#a855f7" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 4"
                    stroke="rgba(255,255,255,0.05)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="time"
                    stroke="transparent"
                    tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'sans-serif' }}
                    tickLine={false}
                    axisLine={false}
                    interval={3}
                  />
                  <YAxis
                    stroke="transparent"
                    tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'sans-serif' }}
                    tickLine={false}
                    axisLine={false}
                    domain={[0, 800]}
                  />
                  <Tooltip content={(props) => <CustomTooltip {...props} />} cursor={{ stroke: 'rgba(168,85,247,0.3)', strokeWidth: 1.5 }} />
                  <Area
                    type="monotone"
                    dataKey="intensity"
                    stroke="#a855f7"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#purpleGrad)"
                    dot={false}
                    activeDot={{ r: 5, fill: '#a855f7', stroke: '#ffffff', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          {/* Action Callout Banner (Matching Stitch design) */}
          <div className="p-6 rounded-2xl bg-gradient-to-r from-[#081b16] via-[#09221b] to-[#0a1824] border border-emerald-500/25 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 shadow-xl relative overflow-hidden">
            <div className="flex items-center gap-4 relative z-10">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-md flex-shrink-0">
                <Leaf size={24} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white mb-0.5">
                  Optimize your workload, reduce your carbon footprint.
                </h4>
                <p className="text-xs text-slate-400">
                  Find the best time to work with real-time grid data and intelligent scheduling.
                </p>
              </div>
            </div>

            <button
              onClick={() => navigate('/activities')}
              className="px-5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all shadow-lg shadow-emerald-500/25 flex items-center gap-2 flex-shrink-0 cursor-pointer"
            >
              <Plus size={16} />
              <span>New Activity</span>
            </button>
          </div>

          {/* Green Time Windows */}
          <GlassCard hoverEffect onClick={() => navigate('/windows')} className="cursor-pointer group p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wind className="w-5 h-5 text-teal-400 flex-shrink-0" />
                <h3 className="text-base font-bold text-white">Green Time Windows</h3>
              </div>
              <span className="text-xs font-bold text-teal-400 flex items-center gap-1 group-hover:text-teal-300 transition-colors">
                All Windows <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </div>

            <GreenWindowsList windows={greenWindows.slice(0, 5)} />
          </GlassCard>

        </div>

        {/* Right Column (4 cols) */}
        <div className="lg:col-span-4 space-y-6">

          {/* Activity Lifecycle Card */}
          <GlassCard hoverEffect onClick={() => navigate('/activities')} className="cursor-pointer p-6">
            <div className="mb-4 flex items-center justify-between">
              <h4 className="text-sm font-bold text-white">Activity Lifecycle</h4>
              <ArrowRight className="h-4 w-4 text-slate-500" />
            </div>

            {/* Donut Chart representation */}
            <div className="relative h-44 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={75}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} stroke="transparent" />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                <span className="text-2xl font-black text-white">{totalTasksCount}</span>
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Total Activities</span>
              </div>
            </div>

            {/* Legend Counts */}
            <div className="grid grid-cols-2 gap-2.5 mt-2 text-xs">
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                <span className="text-slate-300 font-medium">Pending:</span>
                <span className="font-bold text-white ml-auto">{pendingCount}</span>
              </div>
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span className="text-slate-300 font-medium">Scheduled:</span>
                <span className="font-bold text-white ml-auto">{scheduledCount}</span>
              </div>
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="text-slate-300 font-medium">Running:</span>
                <span className="font-bold text-white ml-auto">{runningCount}</span>
              </div>
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-500/10 border border-slate-500/20">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />
                <span className="text-slate-300 font-medium">Completed:</span>
                <span className="font-bold text-white ml-auto">{completedCount}</span>
              </div>
            </div>
          </GlassCard>

          {/* Grid Region */}
          <GlassCard hoverEffect onClick={() => navigate('/settings')} className="cursor-pointer p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Grid Region</span>
              <Globe className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-base font-bold text-white">{selectedZone}</h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  {carbon.isSimulated ? 'Simulated Model' : 'Live Electricity Maps API'}
                </p>
              </div>
              <div className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 border ${
                isLow
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
              }`}>
                <ShieldCheck size={14} /> {isLow ? 'Optimal' : 'Moderate'}
              </div>
            </div>
          </GlassCard>

          {/* AI Recommendation */}
          <GlassCard hoverEffect onClick={() => navigate('/optimization')} className="cursor-pointer group p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-purple-400" />
                <h4 className="text-sm font-bold text-white">AI Recommendation</h4>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-purple-400 transition-colors" />
            </div>
            <div className="p-4 rounded-xl bg-purple-500/[0.08] border border-purple-500/25">
              <p className="text-xs text-slate-200 leading-relaxed">
                Delay batch training by <span className="text-white font-semibold">2 hours</span> to utilize Green Window GW-104.
                Estimated saving: <span className="text-emerald-400 font-bold">42% carbon</span>.
              </p>
            </div>
          </GlassCard>

          {/* Recent Activities List */}
          <GlassCard hoverEffect onClick={() => navigate('/activities')} className="cursor-pointer group p-6">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold text-white">Recent Activities</h4>
              <span className="text-xs font-semibold text-slate-400 group-hover:text-white transition-colors flex items-center gap-1">
                View all <ArrowRight className="w-3 h-3" />
              </span>
            </div>
            <div className="space-y-2.5">
              {activitiesLoading ? (
                <LoadingSkeleton count={3} height="h-10" />
              ) : (
                <>
                  {activitiesData?.items.slice(0, 4).map((act) => (
                    <div
                      key={act.id}
                      className="flex items-center justify-between text-xs py-2.5 px-3.5 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.05] transition-colors"
                    >
                      <div className="min-w-0 pr-2">
                        <p className="font-semibold text-white truncate">{act.name}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{act.duration} min · {act.powerDraw}W</p>
                      </div>
                      <StatusBadge status={act.status} />
                    </div>
                  ))}
                  {(!activitiesData?.items || activitiesData.items.length === 0) && (
                    <p className="text-xs text-slate-500 py-3 text-center">No recent activities registered</p>
                  )}
                </>
              )}
            </div>
          </GlassCard>

        </div>
      </div>
    </div>
  );
}

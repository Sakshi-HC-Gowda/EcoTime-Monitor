import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  Activity,
  Leaf,
  Zap,
  Wind,
  Globe,
  Gauge,
  TrendingUp,
  Brain,
  Plus,
  SlidersHorizontal,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';

import { useCarbon, useGreenWindows } from '@/features/carbon/hooks/useCarbon';
import { useZone } from '@/app/ZoneProvider';
import { DashboardCarbonSummary } from '@/features/carbon/components/DashboardCarbonSummary';
import { GreenWindowsList } from '@/features/carbon/components/GreenWindowsList';
import { useActivitiesQuery } from '@/features/activities/hooks/useActivitiesQuery';
import { GlassCard } from '@/components/ui/GlassCard';
import { MetricCard } from '@/components/ui/MetricCard';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';

// ─── Custom recharts tooltip ─────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 border border-white/[0.10] rounded-xl px-3.5 py-2.5 shadow-xl text-xs">
      <p className="text-slate-400 mb-1 font-medium">{label}</p>
      <p className="text-purple-300 font-bold">{payload[0]?.value} <span className="text-slate-500 font-normal">gCO₂/kWh</span></p>
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
      <div className="page-shell page-stack">
        <LoadingSkeleton count={1} height="h-12" variant="row" />
        <LoadingSkeleton count={1} height="h-24" />
        <div className="card-grid card-grid-sm-2 card-grid-lg-4">
          <LoadingSkeleton count={4} height="h-28" />
        </div>
        <LoadingSkeleton count={2} height="h-56" />
      </div>
    );
  }

  if (carbonError || !carbon) {
    return (
      <div className="page-shell">
        <ErrorState onRetry={() => refetchCarbon()} />
      </div>
    );
  }

  const currentIntensity = carbon.current.carbonIntensity;
  const isLow = currentIntensity < 180;
  let pendingCount = 0;
  let scheduledCount = 0;
  let runningCount = 0;
  let completedCount = 0;

  for (const task of activitiesData?.items ?? []) {
    if (task.status === 'pending') pendingCount += 1;
    else if (task.status === 'scheduled') scheduledCount += 1;
    else if (task.status === 'running') runningCount += 1;
    else if (task.status === 'completed') completedCount += 1;
  }

  const activeTasksCount = runningCount;
  const totalTasksCount = activitiesData?.total || 0;
  const greenWindows = windows ?? [];

  // Forecast chart data — next 24 hours
  const forecastData = carbon.forecast.slice(0, 24).map((pt) => ({
    time: new Date(pt.datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    intensity: pt.carbonIntensity,
  }));

  // EcoScore
  const ecoScore = Math.max(10, Math.min(99, Math.round(100 - (currentIntensity / 400) * 100)));

  return (
    <div className="page-shell page-stack">

      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-header-title heading-row">
            Carbon Dashboard
            <span className="ds-badge bg-green-500/10 text-green-400 border-green-500/20 align-middle">
              Live Monitoring
            </span>
          </h1>
          <p className="page-header-subtitle">
            Real-time grid emissions telemetry and active workload optimization summary.
          </p>
        </div>

        <div className="cluster">
          <Button size="sm" onClick={() => navigate('/activities')} iconLeft={<Plus className="w-3.5 h-3.5" />}>
            New Activity
          </Button>
          <Button size="icon" variant="ghost" onClick={() => navigate('/settings')} aria-label="Settings">
            <SlidersHorizontal className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* ── Carbon Intelligence (location + zone + current carbon) ─────────── */}
      <DashboardCarbonSummary
        currentCarbon={currentIntensity}
        isSimulated={carbon.isSimulated}
      />

      {/* ── KPI metric row ─────────────────────────────────────────────────── */}
      <div className="card-grid card-grid-sm-2 card-grid-lg-4 items-stretch">
        <MetricCard
          title="Current Carbon"
          value={currentIntensity}
          unit="gCO₂/kWh"
          subtitle={isLow ? 'Below threshold — optimal' : 'Above threshold — moderate'}
          icon={Activity}
          iconColor={isLow ? 'text-green-400' : 'text-amber-400'}
          iconBg={isLow ? 'bg-green-500/10 border-green-500/20' : 'bg-amber-500/10 border-amber-500/20'}
          accentClass={isLow ? 'metric-accent-green' : 'metric-accent-amber'}
          onClick={() => navigate('/carbon')}
        />
        <MetricCard
          title="EcoScore"
          value={ecoScore}
          unit="/ 100"
          subtitle="Optimization efficiency rating"
          icon={Gauge}
          iconColor="text-cyan-400"
          iconBg="bg-cyan-500/10 border-cyan-500/20"
          accentClass={ecoScore >= 60 ? 'metric-accent-green' : 'metric-accent-amber'}
          onClick={() => navigate('/optimization')}
        />
        <MetricCard
          title="Carbon Saved"
          value="4.82"
          unit="kg CO₂"
          subtitle="Cumulative via scheduling"
          icon={Leaf}
          iconColor="text-green-400"
          iconBg="bg-green-500/10 border-green-500/20"
          accentClass="metric-accent-green"
          trend={{ value: '12% vs yesterday', positive: true }}
          onClick={() => navigate('/sustainability')}
        />
        <MetricCard
          title="Active Workloads"
          value={activeTasksCount}
          unit={`/ ${totalTasksCount} total`}
          subtitle={`P:${pendingCount} S:${scheduledCount} R:${runningCount} C:${completedCount}`}
          icon={Zap}
          iconColor="text-amber-400"
          iconBg="bg-amber-500/10 border-amber-500/20"
          accentClass="metric-accent-amber"
          onClick={() => navigate('/activities')}
        />
      </div>

      {/* ── Main grid ──────────────────────────────────────────────────────── */}
      <div className="content-grid content-grid-12">

        {/* Left column — 8 cols */}
        <div className="section-stack lg:col-span-8">

          {/* Live Carbon Forecast */}
          <GlassCard hoverEffect onClick={() => navigate('/forecast')} className="cursor-pointer group">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="w-4 h-4 text-purple-400 flex-shrink-0" />
                  <h3 className="text-base font-bold leading-snug text-white">Live Carbon Forecast</h3>
                </div>
                <p className="text-xs text-slate-500">
                  Predicted grid intensity for {selectedZone} — next 24 hours
                </p>
              </div>
              <span className="cluster text-xs font-semibold text-purple-400 transition-colors group-hover:text-purple-300">
                Full Forecast <ArrowRight className="w-3 h-3" />
              </span>
            </div>

            <div className="h-[224px] w-full sm:h-[248px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={forecastData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorInt" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#a855f7" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 6"
                    stroke="rgba(255,255,255,0.04)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="time"
                    stroke="transparent"
                    tick={{ fill: '#475569', fontSize: 10, fontFamily: 'Plus Jakarta Sans' }}
                    tickLine={false}
                    axisLine={false}
                    interval={2}
                  />
                  <YAxis
                    stroke="transparent"
                    tick={{ fill: '#475569', fontSize: 10, fontFamily: 'Plus Jakarta Sans' }}
                    tickLine={false}
                    axisLine={false}
                    width={36}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(168,85,247,0.2)', strokeWidth: 1 }} />
                  <Area
                    type="monotone"
                    dataKey="intensity"
                    stroke="#a855f7"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorInt)"
                    dot={false}
                    activeDot={{ r: 4, fill: '#a855f7', strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          {/* Green Time Windows */}
          <GlassCard hoverEffect onClick={() => navigate('/windows')} className="cursor-pointer group">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Wind className="w-4 h-4 text-teal-400 flex-shrink-0" />
                <h3 className="text-base font-bold leading-snug text-white">Green Time Windows</h3>
              </div>
              <span className="text-xs font-semibold text-teal-400 flex items-center gap-1 group-hover:text-teal-300 transition-colors">
                All Windows <ArrowRight className="w-3 h-3" />
              </span>
            </div>

            <GreenWindowsList windows={greenWindows.slice(0, 6)} />
          </GlassCard>
        </div>

        {/* Right column — 4 cols */}
        <div className="section-stack lg:col-span-4">

          {/* Grid Region */}
          <GlassCard hoverEffect onClick={() => navigate('/carbon')} className="cursor-pointer">
          <GlassCard hoverEffect onClick={() => navigate('/activities')} className="cursor-pointer">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-[13px] font-bold text-white">Activity Lifecycle</h4>
              <ArrowRight className="h-3.5 w-3.5 text-slate-600" />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.06] p-2.5">
                <p className="text-slate-400">Pending</p>
                <p className="text-lg font-bold text-blue-300">{pendingCount}</p>
              </div>
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-2.5">
                <p className="text-slate-400">Scheduled</p>
                <p className="text-lg font-bold text-amber-300">{scheduledCount}</p>
              </div>
              <div className="rounded-xl border border-green-500/20 bg-green-500/[0.06] p-2.5">
                <p className="text-slate-400">Running</p>
                <p className="text-lg font-bold text-green-300">{runningCount}</p>
              </div>
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-2.5">
                <p className="text-slate-400">Completed</p>
                <p className="text-lg font-bold text-emerald-300">{completedCount}</p>
              </div>
            </div>
          </GlassCard>

          {/* Grid Profile */}
          <GlassCard hoverEffect onClick={() => navigate('/settings')} className="cursor-pointer">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em]">Grid Region</span>
              <Globe className="w-3.5 h-3.5 text-green-400" />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-[15px] font-bold text-white">{selectedZone}</h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  {carbon.isSimulated ? 'Simulated Model' : 'Live Electricity Maps'}
                </p>
              </div>
              <div className={`px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1.5 flex-shrink-0 border ${
                isLow
                  ? 'bg-green-500/10 text-green-400 border-green-500/20'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
              }`}>
                <ShieldCheck className="w-3 h-3" /> {isLow ? 'Optimal' : 'Moderate'}
              </div>
            </div>
          </GlassCard>

          {/* AI Recommendation */}
          <GlassCard hoverEffect onClick={() => navigate('/optimization')} className="cursor-pointer group">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Brain className="w-3.5 h-3.5 text-purple-400" />
                <h4 className="text-[13px] font-bold text-white">AI Recommendation</h4>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-purple-400 transition-colors" />
            </div>
            <div className="p-3 rounded-xl bg-purple-500/[0.05] border border-purple-500/15">
              <p className="text-xs text-slate-300 leading-relaxed">
                Delay batch training by <span className="text-white font-semibold">2 hours</span> to utilize Green Window GW-104.
                Estimated saving: <span className="text-green-400 font-semibold">42% carbon</span>.
              </p>
            </div>
          </GlassCard>

          {/* Recent Activities */}
          <GlassCard hoverEffect onClick={() => navigate('/activities')} className="cursor-pointer group">
            <div className="flex items-center justify-between mb-3.5">
              <h4 className="text-[13px] font-bold text-white">Recent Activities</h4>
              <span className="text-[11px] font-semibold text-slate-500 group-hover:text-white transition-colors flex items-center gap-1">
                View all <ArrowRight className="w-3 h-3" />
              </span>
            </div>
            <div className="space-y-2">
              {activitiesLoading ? (
                <LoadingSkeleton count={3} height="h-12" />
              ) : (
                <>
              {activitiesData?.items.slice(0, 4).map((act) => (
                <div
                  key={act.id}
                  className="flex items-center justify-between text-xs py-2 px-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] transition-colors"
                >
                  <div className="min-w-0 pr-2">
                    <p className="font-semibold text-white truncate">{act.name}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{act.duration} min · {act.powerDraw}W</p>
                  </div>
                  <StatusBadge status={act.status} />
                </div>
              ))}
              {(!activitiesData?.items || activitiesData.items.length === 0) && (
                <p className="text-xs text-slate-500 py-3 text-center">No recent activities</p>
              )}
                </>
              )}
            </div>
          </GlassCard>

          {/* Quick Actions */}
          <GlassCard variant="inset" padding="sm">
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.10em] mb-3">Quick Actions</p>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => navigate('/scheduler')}
                className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.10] text-[12px] font-semibold text-slate-300 hover:text-white transition-all duration-200 text-left leading-tight group"
              >
                Open Scheduler
                <ArrowRight className="w-3 h-3 mt-1.5 text-slate-600 group-hover:text-white transition-colors" />
              </button>
              <button
                onClick={() => navigate('/forecast')}
                className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.10] text-[12px] font-semibold text-slate-300 hover:text-white transition-all duration-200 text-left leading-tight group"
              >
                Forecast
                <ArrowRight className="w-3 h-3 mt-1.5 text-slate-600 group-hover:text-white transition-colors" />
              </button>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

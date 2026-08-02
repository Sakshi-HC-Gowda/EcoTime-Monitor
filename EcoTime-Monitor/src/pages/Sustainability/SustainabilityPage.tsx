import { useState } from 'react';
import {
  Leaf,
  TreePine,
  Wind,
  Gauge,
  History as HistoryIcon,
  Brain,
  CheckCircle2,
  Clock,
  XCircle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

import { useAnalytics, useActivityHistory, useRecommendations } from '@/features/analytics/hooks/useAnalytics';
import { GlassCard } from '@/components/ui/GlassCard';
import { MetricCard } from '@/components/ui/MetricCard';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import type { EcoScoreTrendPoint } from '@/types/domain';

type TrendGranularity = 'daily' | 'weekly' | 'monthly';

interface TrendTooltipProps {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}

function TrendTooltip({ active, payload, label }: TrendTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 border border-white/[0.10] rounded-xl px-3.5 py-2.5 shadow-xl text-xs">
      <p className="text-slate-400 mb-1 font-medium">{label}</p>
      <p className="text-green-300 font-bold">{payload[0]?.value} <span className="text-slate-500 font-normal">/ 100</span></p>
    </div>
  );
}

function RecommendationStatusIcon({ status }: { status: string }) {
  if (status === 'accepted') return <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />;
  if (status === 'rejected') return <XCircle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />;
  return <Clock className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />;
}

export function SustainabilityPage() {
  const [granularity, setGranularity] = useState<TrendGranularity>('daily');

  const { data: analytics, isLoading: analyticsLoading, isError: analyticsError, refetch } = useAnalytics('US-CA');
  const { data: history, isLoading: historyLoading } = useActivityHistory(1, 8);
  const { data: recommendations, isLoading: recsLoading } = useRecommendations(1, 6);

  if (analyticsLoading) {
    return (
      <div className="page-shell page-stack">
        <LoadingSkeleton count={1} height="h-12" variant="row" />
        <div className="card-grid card-grid-sm-3">
          <LoadingSkeleton count={3} height="h-28" />
        </div>
        <LoadingSkeleton count={2} height="h-64" />
      </div>
    );
  }

  if (analyticsError || !analytics) {
    return (
      <div className="page-shell">
        <ErrorState onRetry={() => refetch()} message="Could not load sustainability analytics. Please verify the EcoTime backend is running." />
      </div>
    );
  }

  const treesEquivalent = (analytics.totalCarbonSavedKg / 21).toFixed(2); // ~21kg CO2 absorbed / tree / year (illustrative estimate)
  const trendData: EcoScoreTrendPoint[] = analytics.ecoScoreTrend[granularity];

  return (
    <div className="page-shell page-stack">
      <div>
        <h1 className="page-header-title heading-row">
          Sustainability
          <span className="ds-badge bg-green-500/10 text-green-400 border-green-500/20">
            Impact Tracker
          </span>
        </h1>
        <p className="page-header-subtitle">Track cumulative carbon savings and environmental impact metrics.</p>
      </div>

      {/* ── Impact metric cards ────────────────────────────────────────── */}
      <div className="card-grid card-grid-sm-3">
        <MetricCard
          title="Total Carbon Avoided"
          value={analytics.totalCarbonSavedKg.toFixed(2)}
          unit="kg CO₂"
          subtitle={`From ${analytics.recommendationsFollowed} accepted recommendation${analytics.recommendationsFollowed === 1 ? '' : 's'}`}
          icon={Leaf}
          iconColor="text-green-400"
          iconBg="bg-green-500/10 border-green-500/20"
          accentClass="metric-accent-green"
        />
        <MetricCard
          title="Trees Equivalent"
          value={treesEquivalent}
          unit="trees / yr"
          subtitle="Illustrative CO₂-absorption estimate"
          icon={TreePine}
          iconColor="text-teal-400"
          iconBg="bg-teal-500/10 border-teal-500/20"
          accentClass="metric-accent-teal"
        />
        <MetricCard
          title="Clean Energy Scheduled"
          value={analytics.totalEnergySavedKwh.toFixed(2)}
          unit="kWh"
          subtitle="Shifted into low-carbon windows"
          icon={Wind}
          iconColor="text-blue-400"
          iconBg="bg-blue-500/10 border-blue-500/20"
          accentClass="metric-accent-blue"
        />
      </div>

      {/* ── EcoScore trend + weekly summary ──────────────────────────── */}
      <div className="content-grid content-grid-12">
        <GlassCard hoverEffect={false} className="lg:col-span-8">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Gauge className="w-4 h-4 text-green-400 flex-shrink-0" />
                <h3 className="text-base font-bold leading-snug text-white">EcoScore Trend</h3>
              </div>
              <p className="text-xs text-slate-500">Composite score — completions, green recommendations, and savings</p>
            </div>
            <div className="flex gap-1.5 rounded-xl bg-white/[0.03] border border-white/[0.06] p-1">
              {(['daily', 'weekly', 'monthly'] as TrendGranularity[]).map((g) => (
                <button
                  key={g}
                  onClick={() => setGranularity(g)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold capitalize transition-colors ${
                    granularity === g ? 'bg-green-500/15 text-green-400' : 'text-slate-500 hover:text-white'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 6" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="transparent"
                  tick={{ fill: '#475569', fontSize: 10, fontFamily: 'Plus Jakarta Sans' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  stroke="transparent"
                  tick={{ fill: '#475569', fontSize: 10, fontFamily: 'Plus Jakarta Sans' }}
                  tickLine={false}
                  axisLine={false}
                  width={30}
                />
                <Tooltip content={<TrendTooltip />} cursor={{ stroke: 'rgba(74,222,128,0.2)', strokeWidth: 1 }} />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#4ade80"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#4ade80', strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: '#4ade80', strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        <GlassCard hoverEffect={false} className="lg:col-span-4">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] mb-4">This Week</p>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Total activities</span>
              <span className="text-sm font-bold text-white">{analytics.weeklySummary.totalActivities}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Completed</span>
              <span className="text-sm font-bold text-white">{analytics.weeklySummary.completed}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Avg. carbon intensity</span>
              <span className="text-sm font-bold text-white">{analytics.weeklySummary.averageCarbonIntensity} g/kWh</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Energy saved</span>
              <span className="text-sm font-bold text-green-400">{analytics.weeklySummary.energySavedKwh.toFixed(2)} kWh</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Carbon saved</span>
              <span className="text-sm font-bold text-green-400">{analytics.weeklySummary.carbonSavedKg.toFixed(2)} kg</span>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-white/[0.06]">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] mb-3">Today's Activities</p>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl bg-green-500/[0.06] border border-green-500/15 py-2.5">
                <p className="text-lg font-extrabold text-green-400">{analytics.todaysActivities.completed}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wide">Completed</p>
              </div>
              <div className="rounded-xl bg-blue-500/[0.06] border border-blue-500/15 py-2.5">
                <p className="text-lg font-extrabold text-blue-400">{analytics.todaysActivities.pending}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wide">Pending</p>
              </div>
              <div className="rounded-xl bg-amber-500/[0.06] border border-amber-500/15 py-2.5">
                <p className="text-lg font-extrabold text-amber-400">{analytics.todaysActivities.postponed}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wide">Postponed</p>
              </div>
              <div className="rounded-xl bg-rose-500/[0.06] border border-rose-500/15 py-2.5">
                <p className="text-lg font-extrabold text-rose-400">{analytics.todaysActivities.cancelled}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wide">Cancelled</p>
              </div>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* ── History + recommendations ────────────────────────────────── */}
      <div className="content-grid content-grid-12">
        <GlassCard hoverEffect={false} className="lg:col-span-6">
          <div className="flex items-center gap-2 mb-4">
            <HistoryIcon className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <h3 className="text-base font-bold leading-snug text-white">Recent Activity History</h3>
          </div>

          {historyLoading ? (
            <LoadingSkeleton count={4} height="h-12" variant="row" />
          ) : !history?.items.length ? (
            <EmptyState
              icon={HistoryIcon}
              title="No history yet"
              description="Status changes on your activities will show up here as they happen."
              accentColor="teal"
            />
          ) : (
            <div className="space-y-2">
              {history.items.map((h) => (
                <div
                  key={h.id}
                  className="flex items-center justify-between text-xs py-2.5 px-3 rounded-xl bg-white/[0.02] border border-white/[0.04]"
                >
                  <div className="min-w-0 pr-2">
                    <p className="font-semibold text-white truncate">
                      {h.previousStatus ? `${h.previousStatus} → ${h.newStatus}` : `Created (${h.newStatus})`}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                      {h.activityId} · {new Date(h.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  {h.executionTime != null && (
                    <span className="text-[10px] font-mono text-slate-500 flex-shrink-0">{Math.round(h.executionTime)}s</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </GlassCard>

        <GlassCard hoverEffect={false} className="lg:col-span-6">
          <div className="flex items-center gap-2 mb-4">
            <Brain className="w-4 h-4 text-purple-400 flex-shrink-0" />
            <h3 className="text-base font-bold leading-snug text-white">Recommendation Log</h3>
          </div>

          {recsLoading ? (
            <LoadingSkeleton count={4} height="h-12" variant="row" />
          ) : !recommendations?.items.length ? (
            <EmptyState
              icon={Brain}
              title="No recommendations yet"
              description="Run the Scheduler or check a task's EcoScore to generate optimization advice."
              accentColor="purple"
            />
          ) : (
            <div className="space-y-2">
              {recommendations.items.map((r) => (
                <div
                  key={r.id}
                  className="flex items-start gap-2.5 text-xs py-2.5 px-3 rounded-xl bg-white/[0.02] border border-white/[0.04]"
                >
                  <RecommendationStatusIcon status={r.status} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-white truncate">{r.text}</p>
                    {r.reason && <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{r.reason}</p>}
                  </div>
                  {r.expectedCarbonSaving != null && (
                    <span className="text-[10px] font-semibold text-green-400 flex-shrink-0">
                      {Math.round(r.expectedCarbonSaving)}g
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}

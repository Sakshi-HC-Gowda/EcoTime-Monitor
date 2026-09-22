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

import {
  useCarbon,
  useGreenWindows,
} from '@/features/carbon/hooks/useCarbon';

import { useZone } from '@/app/ZoneProvider';

import { GreenWindowsList } from '@/features/carbon/components/GreenWindowsList';

import { useActivitiesQuery } from '@/features/activities/hooks/useActivitiesQuery';

import { GlassCard } from '@/components/ui/GlassCard';
import { MetricCard } from '@/components/ui/MetricCard';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { StatusBadge } from '@/components/ui/StatusBadge';

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type CustomTooltipProps = {
  active?: boolean;
  payload?: readonly {
    value?: number | string | readonly (number | string)[];
  }[];
  label?: string | number;
};

/* -------------------------------------------------------------------------- */
/* Custom Recharts Tooltip                                                    */
/* -------------------------------------------------------------------------- */

function CustomTooltip({
  active,
  payload,
  label,
}: CustomTooltipProps) {
  if (!active || !payload?.length) {
    return null;
  }

  const raw = payload[0]?.value as
    | number
    | string
    | readonly (number | string)[]
    | undefined;

  const display = Array.isArray(raw)
    ? raw[0]
    : raw;

  return (
    <div className="rounded-xl border border-white/[0.12] bg-[#0c1322] px-3.5 py-2.5 text-xs shadow-2xl">
      <p className="mb-1 font-medium text-slate-400">
        {label}
      </p>

      <p className="font-bold text-purple-400">
        {display}{' '}
        <span className="font-normal text-slate-500">
          gCO₂/kWh
        </span>
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Dashboard                                                                  */
/* -------------------------------------------------------------------------- */

export function DashboardPage() {
  const navigate = useNavigate();

  const { selectedZone } = useZone();

  const {
    data: carbon,
    isLoading: carbonLoading,
    isError: carbonError,
    refetch: refetchCarbon,
  } = useCarbon(selectedZone);

  const {
    data: windows,
    isLoading: windowsLoading,
  } = useGreenWindows(
    selectedZone,
    180
  );

  const {
    data: activitiesData,
    isLoading: activitiesLoading,
  } = useActivitiesQuery(1, 10);

  /* ------------------------------------------------------------------------ */
  /* Loading                                                                  */
  /* ------------------------------------------------------------------------ */

  if (carbonLoading || windowsLoading) {
    return (
      <div className="page-shell page-stack p-6 space-y-6">
        <LoadingSkeleton
          count={1}
          height="h-24"
        />

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <LoadingSkeleton
            count={4}
            height="h-32"
          />
        </div>

        <LoadingSkeleton
          count={2}
          height="h-64"
        />
      </div>
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Error                                                                    */
  /* ------------------------------------------------------------------------ */

  if (carbonError || !carbon) {
    return (
      <div className="page-shell p-6">
        <ErrorState
          onRetry={() => refetchCarbon()}
        />
      </div>
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Calculations                                                             */
  /* ------------------------------------------------------------------------ */

  const currentIntensity =
    carbon.current.carbonIntensity;

  const isLow =
    currentIntensity < 180;

  const activities =
    activitiesData?.items ?? [];

  const greenWindows =
    windows ?? [];

  let pendingCount = 0;
  let scheduledCount = 0;
  let runningCount = 0;
  let completedCount = 0;

  for (const task of activities) {
    if (task.status === 'pending') {
      pendingCount += 1;
    } else if (
      task.status === 'scheduled'
    ) {
      scheduledCount += 1;
    } else if (
      task.status === 'running'
    ) {
      runningCount += 1;
    } else if (
      task.status === 'completed'
    ) {
      completedCount += 1;
    }
  }

  const activeTasksCount =
    runningCount;

  const totalTasksCount =
    activitiesData?.total || 0;

  /* ------------------------------------------------------------------------ */
  /* Forecast chart                                                           */
  /* ------------------------------------------------------------------------ */

  const forecastData =
    carbon.forecast
      .slice(0, 24)
      .map((pt) => ({
        time: new Date(
          pt.datetime
        ).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        intensity:
          pt.carbonIntensity,
      }));

  /* ------------------------------------------------------------------------ */
  /* EcoScore                                                                 */
  /* ------------------------------------------------------------------------ */

  const ecoScore = Math.max(
    10,
    Math.min(
      99,
      Math.round(
        100 -
          (currentIntensity / 400) *
            100
      )
    )
  );

  /* ------------------------------------------------------------------------ */
  /* Activity lifecycle donut                                                 */
  /* ------------------------------------------------------------------------ */

  const pieData = [
    {
      name: 'Pending',
      value: pendingCount || 1,
      color: '#3b82f6',
    },
    {
      name: 'Scheduled',
      value: scheduledCount || 0,
      color: '#f59e0b',
    },
    {
      name: 'Running',
      value: runningCount || 0,
      color: '#10b981',
    },
    {
      name: 'Completed',
      value: completedCount || 0,
      color: '#64748b',
    },
  ];

  /* ------------------------------------------------------------------------ */
  /* Date                                                                     */
  /* ------------------------------------------------------------------------ */

  const todayDateString =
    new Date().toLocaleDateString(
      'en-US',
      {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }
    );

  /* ------------------------------------------------------------------------ */
  /* Main                                                                     */
  /* ------------------------------------------------------------------------ */

  return (
    <div className="page-shell page-stack max-w-[1680px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                             */}
      {/* ------------------------------------------------------------------ */}

      <div className="flex flex-col gap-4 rounded-2xl border border-white/[0.07] bg-gradient-to-r from-[#0b1424] via-[#09111e] to-[#070c14] p-6 shadow-xl backdrop-blur-md sm:p-7 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
            Good Evening, Sakshi!{' '}
            <span className="inline-block animate-pulse">
              👋
            </span>
          </h1>

          <p className="mt-1 text-xs font-medium text-slate-400 sm:text-sm">
            Let's make your digital work
            greener today.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Date */}
          <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.04] px-3.5 py-2 text-xs font-semibold text-slate-300">
            <Calendar
              size={14}
              className="text-slate-400"
            />

            <span>
              {todayDateString}
            </span>

            <span className="text-slate-600">
              |
            </span>

            <span className="text-slate-400">
              Karnataka, India (
              {selectedZone})
            </span>
          </div>

          {/* Live monitoring */}
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-3.5 py-2 text-xs font-bold text-emerald-400 shadow-sm">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/20">
              <Leaf
                size={14}
                className="text-emerald-400"
              />
            </div>

            <span>
              Live Monitoring
            </span>

            <span className="h-2 w-2 animate-ping rounded-full bg-emerald-400" />

            <span className="font-normal text-slate-400">
              Grid: {selectedZone}
            </span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* KPI Cards                                                          */}
      {/* ------------------------------------------------------------------ */}

      <div className="card-grid card-grid-sm-2 card-grid-lg-4 items-stretch gap-6">
        <MetricCard
          title="Current Carbon"
          value={currentIntensity}
          unit="gCO₂/kWh"
          subtitle={
            isLow
              ? 'Below threshold — optimal'
              : 'Above threshold — moderate'
          }
          icon={Zap}
          iconColor="text-amber-400"
          iconBg="bg-amber-500/15 border-amber-500/30"
          trend={{
            value: '12% vs yesterday',
            positive: false,
          }}
          onClick={() =>
            navigate('/carbon')
          }
        />

        <MetricCard
          title="EcoScore"
          value={`${ecoScore} / 100`}
          subtitle="Optimization rating"
          icon={Leaf}
          iconColor="text-emerald-400"
          iconBg="bg-emerald-500/15 border-emerald-500/30"
          onClick={() =>
            navigate('/optimization')
          }
        />

        <MetricCard
          title="Carbon Saved"
          value="4.82"
          unit="kg CO₂"
          subtitle="Cumulative via scheduling"
          icon={Leaf}
          iconColor="text-emerald-400"
          iconBg="bg-emerald-500/15 border-emerald-500/30"
          onClick={() =>
            navigate('/sustainability')
          }
        />

        <MetricCard
          title="Active Workloads"
          value={`${activeTasksCount} / ${totalTasksCount}`}
          unit="total"
          subtitle={`P:${pendingCount} S:${scheduledCount} R:${runningCount} C:${completedCount}`}
          icon={ListFilter}
          iconColor="text-blue-400"
          iconBg="bg-blue-500/15 border-blue-500/30"
          onClick={() =>
            navigate('/activities')
          }
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Main Content Grid                                                  */}
      {/* ------------------------------------------------------------------ */}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column */}
        <div className="space-y-6 lg:col-span-8">
          {/* -------------------------------------------------------------- */}
          {/* Carbon Forecast                                                */}
          {/* -------------------------------------------------------------- */}

          <GlassCard
            hoverEffect
            onClick={() =>
              navigate('/forecast')
            }
            className="group cursor-pointer p-6"
          >
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 flex-shrink-0 text-emerald-400" />

                  <h3 className="text-base font-bold text-white">
                    Live Carbon Forecast
                  </h3>
                </div>

                <p className="text-xs text-slate-400">
                  Predicted grid intensity for{' '}
                  {selectedZone} — next 24
                  hours
                </p>
              </div>

              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-400 transition-colors group-hover:text-purple-300">
                View Full Forecast
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </div>

            <div className="h-[280px] w-full">
              <ResponsiveContainer
                width="100%"
                height="100%"
              >
                <AreaChart
                  data={forecastData}
                  margin={{
                    top: 10,
                    right: 10,
                    left: -20,
                    bottom: 0,
                  }}
                >
                  <defs>
                    <linearGradient
                      id="purpleGrad"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="#a855f7"
                        stopOpacity={0.35}
                      />

                      <stop
                        offset="95%"
                        stopColor="#a855f7"
                        stopOpacity={0}
                      />
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
                    tick={{
                      fill: '#64748b',
                      fontSize: 11,
                      fontFamily:
                        'sans-serif',
                    }}
                    tickLine={false}
                    axisLine={false}
                    interval={3}
                  />

                  <YAxis
                    stroke="transparent"
                    tick={{
                      fill: '#64748b',
                      fontSize: 11,
                      fontFamily:
                        'sans-serif',
                    }}
                    tickLine={false}
                    axisLine={false}
                    domain={[0, 800]}
                  />

                  <Tooltip
                    content={(props) => (
                      <CustomTooltip
                        {...props}
                      />
                    )}
                    cursor={{
                      stroke:
                        'rgba(168,85,247,0.3)',
                      strokeWidth: 1.5,
                    }}
                  />

                  <Area
                    type="monotone"
                    dataKey="intensity"
                    stroke="#a855f7"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#purpleGrad)"
                    dot={false}
                    activeDot={{
                      r: 5,
                      fill: '#a855f7',
                      stroke: '#ffffff',
                      strokeWidth: 2,
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          {/* -------------------------------------------------------------- */}
          {/* Action Banner                                                   */}
          {/* -------------------------------------------------------------- */}

          <div className="relative flex flex-col items-start justify-between gap-5 overflow-hidden rounded-2xl border border-emerald-500/25 bg-gradient-to-r from-[#081b16] via-[#09221b] to-[#0a1824] p-6 shadow-xl sm:flex-row sm:items-center">
            <div className="relative z-10 flex items-center gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/20 text-emerald-400 shadow-md">
                <Leaf size={24} />
              </div>

              <div>
                <h4 className="mb-0.5 text-sm font-bold text-white">
                  Optimize your workload,
                  reduce your carbon
                  footprint.
                </h4>

                <p className="text-xs text-slate-400">
                  Find the best time to work
                  with real-time grid data
                  and intelligent scheduling.
                </p>
              </div>
            </div>

            <button
              onClick={() =>
                navigate('/activities')
              }
              className="flex flex-shrink-0 cursor-pointer items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-xs font-bold text-slate-950 shadow-lg shadow-emerald-500/25 transition-all hover:bg-emerald-400"
            >
              <Plus size={16} />
              <span>New Activity</span>
            </button>
          </div>

          {/* -------------------------------------------------------------- */}
          {/* Green Windows                                                   */}
          {/* -------------------------------------------------------------- */}

          <GlassCard
            hoverEffect
            onClick={() =>
              navigate('/windows')
            }
            className="group cursor-pointer p-6"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wind className="h-5 w-5 flex-shrink-0 text-teal-400" />

                <h3 className="text-base font-bold text-white">
                  Green Time Windows
                </h3>
              </div>

              <span className="flex items-center gap-1 text-xs font-bold text-teal-400 transition-colors group-hover:text-teal-300">
                All Windows
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </div>

            <GreenWindowsList
              windows={greenWindows.slice(
                0,
                5
              )}
            />
          </GlassCard>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Right Column                                                     */}
        {/* ---------------------------------------------------------------- */}

        <div className="space-y-6 lg:col-span-4">
          {/* -------------------------------------------------------------- */}
          {/* Activity Lifecycle                                             */}
          {/* -------------------------------------------------------------- */}

          <GlassCard
            hoverEffect
            onClick={() =>
              navigate('/activities')
            }
            className="cursor-pointer p-6"
          >
            <div className="mb-4 flex items-center justify-between">
              <h4 className="text-sm font-bold text-white">
                Activity Lifecycle
              </h4>

              <ArrowRight className="h-4 w-4 text-slate-500" />
            </div>

            <div className="relative flex h-44 items-center justify-center">
              <ResponsiveContainer
                width="100%"
                height="100%"
              >
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
                    {pieData.map(
                      (entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.color}
                          stroke="transparent"
                        />
                      )
                    )}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>

              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-2xl font-black text-white">
                  {totalTasksCount}
                </span>

                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Total Activities
                </span>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2.5 text-xs">
              <div className="flex items-center gap-2 rounded-xl border border-blue-500/20 bg-blue-500/10 p-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />

                <span className="font-medium text-slate-300">
                  Pending:
                </span>

                <span className="ml-auto font-bold text-white">
                  {pendingCount}
                </span>
              </div>

              <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 p-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />

                <span className="font-medium text-slate-300">
                  Scheduled:
                </span>

                <span className="ml-auto font-bold text-white">
                  {scheduledCount}
                </span>
              </div>

              <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />

                <span className="font-medium text-slate-300">
                  Running:
                </span>

                <span className="ml-auto font-bold text-white">
                  {runningCount}
                </span>
              </div>

              <div className="flex items-center gap-2 rounded-xl border border-slate-500/20 bg-slate-500/10 p-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-slate-500" />

                <span className="font-medium text-slate-300">
                  Completed:
                </span>

                <span className="ml-auto font-bold text-white">
                  {completedCount}
                </span>
              </div>
            </div>
          </GlassCard>

          {/* -------------------------------------------------------------- */}
          {/* Grid Region                                                     */}
          {/* -------------------------------------------------------------- */}

          <GlassCard
            hoverEffect
            onClick={() =>
              navigate('/settings')
            }
            className="cursor-pointer p-6"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Grid Region
              </span>

              <Globe className="h-4 w-4 text-emerald-400" />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-base font-bold text-white">
                  {selectedZone}
                </h4>

                <p className="mt-0.5 text-xs text-slate-400">
                  {carbon.isSimulated
                    ? 'Simulated Model'
                    : 'Live Electricity Maps API'}
                </p>
              </div>

              <div
                className={`flex flex-shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${
                  isLow
                    ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400'
                    : 'border-amber-500/30 bg-amber-500/15 text-amber-400'
                }`}
              >
                <ShieldCheck size={14} />

                {isLow
                  ? 'Optimal'
                  : 'Moderate'}
              </div>
            </div>
          </GlassCard>

          {/* -------------------------------------------------------------- */}
          {/* AI Recommendation                                              */}
          {/* -------------------------------------------------------------- */}

          <GlassCard
            hoverEffect
            onClick={() =>
              navigate('/optimization')
            }
            className="group cursor-pointer p-6"
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-purple-400" />

                <h4 className="text-sm font-bold text-white">
                  AI Recommendation
                </h4>
              </div>

              <ArrowRight className="h-4 w-4 text-slate-500 transition-colors group-hover:text-purple-400" />
            </div>

            <div className="rounded-xl border border-purple-500/25 bg-purple-500/[0.08] p-4">
              <p className="text-xs leading-relaxed text-slate-200">
                Delay batch training by{' '}
                <span className="font-semibold text-white">
                  2 hours
                </span>{' '}
                to utilize Green Window
                GW-104. Estimated saving:{' '}
                <span className="font-bold text-emerald-400">
                  42% carbon
                </span>
                .
              </p>
            </div>
          </GlassCard>

          {/* -------------------------------------------------------------- */}
          {/* Recent Activities                                              */}
          {/* -------------------------------------------------------------- */}

          <GlassCard
            hoverEffect
            onClick={() =>
              navigate('/activities')
            }
            className="group cursor-pointer p-6"
          >
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-bold text-white">
                Recent Activities
              </h4>

              <span className="flex items-center gap-1 text-xs font-semibold text-slate-400 transition-colors group-hover:text-white">
                View all
                <ArrowRight className="h-3 w-3" />
              </span>
            </div>

            <div className="space-y-2.5">
              {activitiesLoading ? (
                <LoadingSkeleton
                  count={3}
                  height="h-10"
                />
              ) : (
                <>
                  {activitiesData?.items
                    .slice(0, 4)
                    .map((act) => (
                      <div
                        key={act.id}
                        className="flex items-center justify-between rounded-xl border border-white/[0.05] bg-white/[0.02] px-3.5 py-2.5 text-xs transition-colors hover:bg-white/[0.05]"
                      >
                        <div className="min-w-0 pr-2">
                          <p className="truncate font-semibold text-white">
                            {act.name}
                          </p>

                          <p className="mt-0.5 text-[10px] text-slate-400">
                            {act.duration} min ·{' '}
                            {act.powerDraw}W
                          </p>
                        </div>

                        <StatusBadge
                          status={
                            act.status
                          }
                        />
                      </div>
                    ))}

                  {(!activitiesData?.items ||
                    activitiesData.items
                      .length === 0) && (
                    <p className="py-3 text-center text-xs text-slate-500">
                      No recent activities
                      registered
                    </p>
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

export default DashboardPage;
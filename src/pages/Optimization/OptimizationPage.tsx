import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Activity, Brain, CalendarClock, Cpu, ListChecks, PauseCircle, RefreshCw, Zap } from 'lucide-react';
import { useAuth } from '@/features/auth/AuthProvider';
import { useZone } from '@/app/ZoneProvider';
import {
  useOptimizationActivities,
  useOptimizationSchedule,
} from '@/features/optimization/hooks/useOptimization';
import { GlassCard } from '@/components/ui/GlassCard';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import type { GreenWindow, SchedulingRequest, Task } from '@/types/domain';

type OptimizationMethod = SchedulingRequest['method'];

export function OptimizationPage() {
  const { selectedZone } = useZone();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [method, setMethod] = useState<OptimizationMethod>('greedy');
  const [refreshToken, setRefreshToken] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  useEffect(() => {
    const updateTime = () => setCurrentTime(Date.now());
    updateTime();
    const timer = window.setInterval(updateTime, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const {
    data: activities = [],
    isLoading: activitiesLoading,
    isError: activitiesIsError,
    error: activitiesError,
    refetch: refetchActivities,
  } = useOptimizationActivities(user?.id ?? null, user?.organizationId ?? null);
  const tasks = useMemo(
    () => activities.filter(isOptimizationEligible),
    [activities],
  );
  const schedulingEnabled = tasks.length > 0 && Boolean(selectedZone);
  const scheduleQuery = useOptimizationSchedule(
    tasks,
    null,
    method,
    schedulingEnabled,
    selectedZone ?? undefined,
    user?.id,
    user?.organizationId,
    activities,
    refreshToken,
  );
  useEffect(() => {
    if (!scheduleQuery.isSuccess) return;
    void queryClient.invalidateQueries({ queryKey: ['carbon', selectedZone] });
    void queryClient.invalidateQueries({ queryKey: ['windows', selectedZone] });
  }, [queryClient, scheduleQuery.dataUpdatedAt, scheduleQuery.isSuccess, selectedZone]);

  const optimization = schedulingEnabled && !scheduleQuery.isFetching
    ? scheduleQuery.data
    : undefined;
  const result = optimization?.result;
  const savings = optimization?.savings;
  const selectedTasks = useMemo(() => result?.selectedTasks ?? [], [result?.selectedTasks]);
  const selectedTaskIds = useMemo(
    () => new Set(selectedTasks.map((task) => task.id)),
    [selectedTasks],
  );
  const recommendationById = useMemo(
    () => new Map((optimization?.recommendations ?? []).map((item) => [item.activityId, item])),
    [optimization?.recommendations],
  );
  const deferredTasks = useMemo(
    () => (optimization?.tasks ?? tasks).filter((task) => !selectedTaskIds.has(task.id)),
    [optimization?.tasks, selectedTaskIds, tasks],
  );
  const usedWindows = useMemo(() => {
    const usedIds = new Set(selectedTasks.map((task) => task.assignedWindowId));
    return (optimization?.windows ?? []).filter((window) => usedIds.has(window.id));
  }, [optimization?.windows, selectedTasks]);
  const carbonObservationTimestamp = optimization?.carbonData.observedAt
    ? new Date(optimization.carbonData.observedAt).getTime()
    : Number.NaN;
  const carbonObservationIsStale = Number.isFinite(carbonObservationTimestamp)
    && currentTime - carbonObservationTimestamp > 60 * 60 * 1000;

  if (activitiesLoading) {
    return (
      <div className="page-shell page-stack">
        <LoadingSkeleton count={3} height="h-40" />
      </div>
    );
  }

  if (activitiesIsError) {
    return (
      <div className="page-shell page-stack">
        <ErrorState
          title="Unable to load optimization inputs"
          message={activitiesError?.message || 'Activities could not be loaded.'}
          onRetry={() => void refetchActivities()}
        />
      </div>
    );
  }

  if (!user || user.organizationId === null) {
    return (
      <div className="page-shell page-stack">
        <ErrorState
          title="Organization unavailable"
          message="Optimization requires an authenticated organization context."
        />
      </div>
    );
  }

  const formatDateTime = (value?: string | null) => {
    if (!value) return 'Not available';

    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return 'Not available';

    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  };

  const formatNumber = (value?: number, digits = 1) => (
    typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : 'Not available'
  );

  const formatCo2 = (value?: number) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'Not available';
    const amount = `${Math.abs(value).toFixed(2)} gCO2e`;
    return value < 0 ? `${amount} higher emissions` : `${amount} estimated savings`;
  };

  const formatEmissions = (value?: number) => (
    typeof value === 'number' && Number.isFinite(value)
      ? `${value.toFixed(2)} gCO2e`
      : 'Not available'
  );

  const formatReduction = () => {
    const baseline = savings?.baselineCo2;
    const optimized = savings?.recommendedCo2;
    if (
      typeof baseline !== 'number'
      || !Number.isFinite(baseline)
      || baseline <= 0
      || typeof optimized !== 'number'
      || !Number.isFinite(optimized)
    ) {
      return 'Not available';
    }
    return `${formatNumber(((baseline - optimized) / baseline) * 100, 1)}%`;
  };

  const getWindowEnd = (window: GreenWindow) => {
    if (window.endTime) return window.endTime;

    const start = new Date(window.startTime);
    start.setMinutes(start.getMinutes() + window.duration);
    return start.toISOString();
  };

  const greenWindowLabel = usedWindows.length
    ? usedWindows.map((window) => window.id).join(', ')
    : optimization
      ? 'None selected'
      : 'Not available';
  const assignedDuration = selectedTasks.reduce((total, task) => total + task.duration, 0);

  const renderTaskRows = (items: Task[], emptyText: string) => (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="bg-white/[0.03] text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-4 py-3 font-semibold">Activity</th>
            <th className="px-4 py-3 font-semibold">Estimated duration</th>
            <th className="px-4 py-3 font-semibold">Assumed power</th>
            <th className="px-4 py-3 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {items.length > 0 ? (
            items.map((task) => (
              <tr key={task.id} className="text-slate-300">
                <td className="px-4 py-3 font-medium text-white">
                  <div>{task.name}</div>
                  <div className="mt-1 text-xs font-normal text-slate-400">
                    {task.recommendationReason ?? recommendationById.get(task.id)?.reason}
                  </div>
                </td>
                <td className="px-4 py-3">{task.duration} min</td>
                <td className="px-4 py-3">{task.powerDraw} W</td>
                <td className="px-4 py-3 capitalize">{task.status.replace('-', ' ')}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td className="px-4 py-8 text-center text-slate-500" colSpan={4}>
                {emptyText}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="page-shell page-stack">
      <div className="page-header">
        <div>
          <h1 className="page-header-title heading-row">
            AI Optimization Engine
            <span className="ds-badge bg-blue-500/10 text-blue-300 border-blue-500/20">
              Backend Scheduler
            </span>
          </h1>
          <p className="page-header-subtitle">
            Find feasible lower-carbon windows for schedulable activities in {selectedZone}.
          </p>
        </div>
      </div>

      <div className="card-grid card-grid-lg-3">
        <div className="section-stack">
          <GlassCard>
            <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <Cpu className="w-5 h-5 text-blue-400" /> Algorithm
            </h3>
            <div className="segment-control w-full">
              {(['greedy', 'knapsack'] as OptimizationMethod[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setMethod(item)}
                  disabled={scheduleQuery.isFetching}
                  className={`segment-tab flex-1 capitalize ${method === item ? 'active' : ''}`}
                  aria-pressed={method === item}
                >
                  {item}
                </button>
              ))}
            </div>

            <div className="mt-5 space-y-3 text-sm">
              <SummaryRow label="Algorithm Used" value={result?.method ?? method} />
              <SummaryRow label="Eligible Activities" value={tasks.length} />
              <SummaryRow label="Selected Activities" value={selectedTasks.length} />
              <SummaryRow label="Green Window Used" value={greenWindowLabel} />
              <SummaryRow
                label="Carbon intensity"
                value={typeof optimization?.carbonData.currentIntensity === 'number'
                  ? `${formatNumber(optimization.carbonData.currentIntensity, 1)} gCO2e/kWh`
                  : 'Not available'}
              />
              <SummaryRow
                label="Carbon data"
                value={optimization
                  ? `${optimization.carbonData.isSimulated ? 'simulated' : optimization.carbonData.source}; forecast: ${optimization.carbonData.forecastSource}`
                  : 'Not available'}
              />
              <SummaryRow
                label="Observed at"
                value={carbonObservationIsStale
                  ? `Stale — ${formatDateTime(optimization?.carbonData.observedAt)}`
                  : formatDateTime(optimization?.carbonData.observedAt)}
              />
              <SummaryRow
                label="Carbon classification"
                value={optimization?.carbonData.classification ?? 'Not available'}
              />
            </div>

            <Button
              onClick={() => setRefreshToken((token) => token + 1)}
              disabled={!schedulingEnabled || scheduleQuery.isFetching}
              variant="secondary"
              fullWidth
              className="mt-6"
              iconLeft={<RefreshCw className={`w-4 h-4 ${scheduleQuery.isFetching ? 'animate-spin' : ''}`} />}
            >
              {scheduleQuery.isFetching ? 'Refreshing...' : 'Refresh Schedule'}
            </Button>
            {!tasks.length && (
              <p className="mt-3 text-xs text-slate-400">
                Refresh is unavailable because there are no eligible activities.
              </p>
            )}
            {tasks.length > 0 && !selectedZone && (
              <p className="mt-3 text-xs text-amber-300">
                Select a grid zone before refreshing the schedule.
              </p>
            )}
          </GlassCard>

          <GlassCard>
            <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-teal-400" /> Green Window Used
            </h3>
            <div className="space-y-3 text-sm">
              <SummaryRow label="Window" value={greenWindowLabel} />
              <SummaryRow label="Assigned duration" value={`${assignedDuration} min`} />
              <SummaryRow
                label="Window capacity"
                value={usedWindows.length
                  ? `${usedWindows.reduce((total, window) => total + (window.availableCapacity ?? window.duration), 0)} min`
                  : 'Not available'}
              />
              <SummaryRow
                label="Avg Carbon"
                value={usedWindows.length
                  ? `${(usedWindows.reduce((total, window) => total + window.avgCarbonIntensity, 0) / usedWindows.length).toFixed(1)} gCO2e/kWh`
                  : 'Not available'}
              />
              <SummaryRow label="Baseline emissions" value={formatEmissions(savings?.baselineCo2)} />
              <SummaryRow label="Optimized emissions" value={formatEmissions(savings?.recommendedCo2)} />
              <SummaryRow label="Carbon reduction" value={formatReduction()} />
            </div>
            {usedWindows.map((window) => {
              const windowAssignedDuration = selectedTasks
                .filter((task) => task.assignedWindowId === window.id)
                .reduce((total, task) => total + task.duration, 0);
              return (
                <div key={window.id} className="mt-4 border-t border-white/10 pt-3 text-xs text-slate-300">
                  <p className="font-semibold text-white">{window.id}</p>
                  <p>{formatDateTime(window.startTime)} – {formatDateTime(getWindowEnd(window))}</p>
                  <p>{windowAssignedDuration} min assigned of {formatNumber(window.availableCapacity ?? window.duration, 0)} min available</p>
                  {(window.availableIntervals ?? []).map((interval) => (
                    <p key={interval.startTime}>
                      Available: {formatDateTime(interval.startTime)} – {formatDateTime(interval.endTime)}
                    </p>
                  ))}
                </div>
              );
            })}
          </GlassCard>
        </div>

        <div className="section-stack lg:col-span-2">
          {tasks.length === 0 && (
            <EmptyState
              icon={Activity}
              title="No pending activities available to optimize"
              description="There are currently no flexible, non-urgent pending activities available. Create an eligible activity or return one to Pending status."
              accentColor="blue"
            />
          )}

          {tasks.length > 0 && !selectedZone && (
            <ErrorState
              title="Grid zone required"
              message="Select a grid zone before running optimization."
            />
          )}

          {schedulingEnabled && scheduleQuery.isFetching && (
            <GlassCard>
              <div className="flex items-center gap-3 text-slate-300">
                <Brain className="w-5 h-5 animate-pulse text-blue-400" />
                {scheduleQuery.data
                  ? `Refreshing the ${method} optimization recommendation...`
                  : `Loading the latest result or running ${method} optimization...`}
              </div>
            </GlassCard>
          )}

          {schedulingEnabled && scheduleQuery.isError && !scheduleQuery.isFetching && (
            <ErrorState
              title="Scheduling failed"
              message={scheduleQuery.error.message}
              onRetry={() => scheduleQuery.refetch()}
            />
          )}

          {schedulingEnabled && optimization && !scheduleQuery.isError && (
            <>
              {carbonObservationIsStale && (
                <div role="status" className="rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
                  Carbon observation is older than one hour. Review its timestamp before using this recommendation.
                </div>
              )}
              {!optimization.windows.some((window) => (window.availableCapacity ?? window.duration) > 0) && (
                <EmptyState
                  icon={CalendarClock}
                  title="No Green Windows available"
                  description="The current forecast did not provide an available lower-carbon window for this zone."
                  accentColor="blue"
                />
              )}
              <div className="grid gap-4 md:grid-cols-4">
                <MetricTile icon={Zap} label="Estimated net emissions difference" value={formatCo2(savings?.totalSavedCo2)} />
                <MetricTile icon={Cpu} label="Window Utilization" value={`${formatNumber(result?.utilizationPercent, 1)}%`} />
                <MetricTile icon={ListChecks} label="Selected Tasks" value={selectedTasks.length} />
                <MetricTile icon={PauseCircle} label="Deferred Tasks" value={deferredTasks.length} />
              </div>

              <GlassCard>
                <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-amber-400" /> Optimization Results
                </h3>
                <p className="mb-4 text-xs text-slate-400">
                  Recommendation only — activities have not been scheduled.
                </p>
                <div className="grid gap-3 text-sm md:grid-cols-2 mb-6">
                  <SummaryRow label="Algorithm Used" value={result?.method ?? method} />
                  <SummaryRow label="Optimization Timestamp" value={formatDateTime(result?.createdAt)} />
                  <SummaryRow label="Green Window Used" value={greenWindowLabel} />
                  <SummaryRow label="Eligible Activities" value={tasks.length} />
                  <SummaryRow label="Selected Activities" value={selectedTasks.length} />
                  <SummaryRow label="Carbon Reduction" value={formatReduction()} />
                </div>
                {renderTaskRows(selectedTasks, 'No tasks selected for this Green Window.')}
              </GlassCard>

              <GlassCard>
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <PauseCircle className="w-5 h-5 text-slate-400" /> Deferred Tasks
                </h3>
                {renderTaskRows(deferredTasks, 'Every eligible activity was selected for a Green Window.')}
              </GlassCard>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function isOptimizationEligible(task: Task): boolean {
  return (
    ['idle', 'pending', 'paused', 'delayed'].includes(task.status)
    && task.type === 'flexible'
    && task.activityType !== 'file-upload'
    && (task.priorityScore ?? 50) < 80
    && Number.isFinite(task.duration)
    && task.duration > 0
    && Number.isFinite(task.powerDraw)
    && task.powerDraw >= 0
  );
}

function SummaryRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-2 last:border-b-0 last:pb-0">
      <span className="text-slate-400">{label}</span>
      <span className="text-right font-semibold text-white">{value}</span>
    </div>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Zap;
  label: string;
  value: string | number;
}) {
  return (
    <GlassCard padding="sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-slate-400">{label}</p>
          <p className="truncate text-lg font-bold text-white">{value}</p>
        </div>
      </div>
    </GlassCard>
  );
}

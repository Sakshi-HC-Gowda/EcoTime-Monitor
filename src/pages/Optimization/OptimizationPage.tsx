import { useMemo, useState } from 'react';
import { Activity, Brain, CalendarClock, Cpu, ListChecks, PauseCircle, RefreshCw, Zap } from 'lucide-react';
import { useActivitiesQuery } from '@/features/activities/hooks/useActivitiesQuery';
import { useGreenWindows } from '@/features/carbon/hooks/useCarbon';
import { useZone } from '@/app/ZoneProvider';
import { useOptimizationSchedule } from '@/features/optimization/hooks/useOptimization';
import { GlassCard } from '@/components/ui/GlassCard';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import type { GreenWindow, SchedulingRequest, Task } from '@/types/domain';

type OptimizationMethod = SchedulingRequest['method'];

export function OptimizationPage() {
  const { selectedZone } = useZone();
  const [method, setMethod] = useState<OptimizationMethod>('greedy');

  const {
    data: activitiesData,
    isLoading: activitiesLoading,
    isError: activitiesIsError,
    error: activitiesError,
    refetch: refetchActivities,
  } = useActivitiesQuery(1, 50, 'pending');
  const {
    data: windows,
    isLoading: windowsLoading,
    isError: windowsIsError,
    error: windowsError,
    refetch: refetchWindows,
  } = useGreenWindows(selectedZone, 180);

  const tasks = useMemo(() => activitiesData?.items ?? [], [activitiesData?.items]);
  const selectedGreenWindow = windows?.[0] ?? null;
  const schedulingEnabled = tasks.length > 0 && !!selectedGreenWindow;
  const scheduleQuery = useOptimizationSchedule(tasks, selectedGreenWindow, method, schedulingEnabled);

  const optimization = scheduleQuery.data;
  const result = optimization?.result;
  const savings = optimization?.savings;
  const selectedTasks = result?.selectedTasks ?? [];
  const selectedTaskIds = useMemo(
    () => new Set(selectedTasks.map((task) => task.id)),
    [selectedTasks],
  );
  const deferredTasks = useMemo(
    () => (optimization?.tasks ?? tasks).filter((task) => !selectedTaskIds.has(task.id)),
    [optimization?.tasks, selectedTaskIds, tasks],
  );

  if (activitiesLoading || windowsLoading) {
    return (
      <div className="page-shell page-stack max-w-[1650px] mx-auto">
        <LoadingSkeleton count={3} height="h-40" />
      </div>
    );
  }

  if (activitiesIsError || windowsIsError) {
    return (
      <div className="page-shell page-stack">
        <ErrorState
          title="Unable to load optimization inputs"
          message={(activitiesError || windowsError)?.message || 'Activities or Green Windows could not be loaded.'}
          onRetry={() => {
            refetchActivities();
            refetchWindows();
          }}
        />
      </div>
    );
  }

  const formatDateTime = (value?: string) => {
    if (!value) return 'Not available';

    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value));
  };

  const formatNumber = (value?: number, digits = 1) => (
    typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '0.0'
  );

  const formatCo2 = (value?: number) => `${formatNumber(value, 1)} g CO2`;

  const getWindowEnd = (window: GreenWindow | null) => {
    if (!window) return undefined;
    if (window.endTime) return window.endTime;

    const start = new Date(window.startTime);
    start.setMinutes(start.getMinutes() + window.duration);
    return start.toISOString();
  };

  const greenWindowLabel = selectedGreenWindow
    ? `${formatDateTime(selectedGreenWindow.startTime)} - ${formatDateTime(getWindowEnd(selectedGreenWindow))}`
    : 'No Green Window available';

  const renderTaskRows = (items: Task[], emptyText: string) => (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="bg-white/[0.03] text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-4 py-3 font-semibold">Activity</th>
            <th className="px-4 py-3 font-semibold">Duration</th>
            <th className="px-4 py-3 font-semibold">Power</th>
            <th className="px-4 py-3 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {items.length > 0 ? (
            items.map((task) => (
              <tr key={task.id} className="text-slate-300">
                <td className="px-4 py-3 font-medium text-white">{task.name}</td>
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
    <div className="page-shell page-stack max-w-[1650px] mx-auto">
      <div className="page-header">
        <div>
          <h1 className="page-header-title heading-row">
            AI Optimization Engine
            <span className="ds-badge bg-blue-500/10 text-blue-300 border-blue-500/20">
              Backend Scheduler
            </span>
          </h1>
          <p className="page-header-subtitle">
            Schedule pending activities into the cleanest backend-detected Green Window for {selectedZone}.
          </p>
        </div>
      </div>

      <div className="card-grid card-grid-lg-3">
        <div className="section-stack">
          <GlassCard>
            <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <Cpu className="w-5 h-5 text-blue-400" /> Algorithm
            </h3>
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-1">
              {(['greedy', 'knapsack'] as OptimizationMethod[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setMethod(item)}
                  className={`ds-control h-10 text-sm font-semibold capitalize transition ${
                    method === item
                      ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20'
                      : 'text-slate-400 hover:bg-white/[0.05] hover:text-white'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>

            <div className="mt-5 space-y-3 text-sm">
              <SummaryRow label="Algorithm Used" value={result?.method ?? method} />
              <SummaryRow label="Pending Activities" value={tasks.length} />
              <SummaryRow label="Green Window Used" value={selectedGreenWindow?.id ?? 'None'} />
            </div>

            <Button
              onClick={() => scheduleQuery.refetch()}
              disabled={!schedulingEnabled || scheduleQuery.isFetching}
              variant="secondary"
              fullWidth
              className="mt-6"
              iconLeft={<RefreshCw className={`w-4 h-4 ${scheduleQuery.isFetching ? 'animate-spin' : ''}`} />}
            >
              {scheduleQuery.isFetching ? 'Scheduling...' : 'Refresh Schedule'}
            </Button>
          </GlassCard>

          <GlassCard>
            <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-teal-400" /> Green Window Used
            </h3>
            <div className="space-y-3 text-sm">
              <SummaryRow label="Window" value={greenWindowLabel} />
              <SummaryRow label="Duration" value={`${selectedGreenWindow?.duration ?? 0} min`} />
              <SummaryRow label="Avg Carbon" value={`${selectedGreenWindow?.avgCarbonIntensity ?? 0} gCO2/kWh`} />
              <SummaryRow label="Carbon Reduction" value={`${formatNumber(savings?.reductionPercent, 1)}%`} />
            </div>
          </GlassCard>
        </div>

        <div className="section-stack lg:col-span-2">
          {!schedulingEnabled && (
            <EmptyState
              icon={Activity}
              title={tasks.length === 0 ? 'No pending activities' : 'No Green Windows available'}
              description={
                tasks.length === 0
                  ? 'Create or leave activities in pending status before running the scheduler.'
                  : 'The backend did not return a Green Window for the selected zone yet.'
              }
              accentColor="blue"
            />
          )}

          {schedulingEnabled && scheduleQuery.isLoading && (
            <GlassCard>
              <div className="flex items-center gap-3 text-slate-300">
                <Brain className="w-5 h-5 animate-pulse text-blue-400" />
                Running {method} scheduling against the backend...
              </div>
            </GlassCard>
          )}

          {schedulingEnabled && scheduleQuery.isError && (
            <ErrorState
              title="Scheduling failed"
              message={scheduleQuery.error.message}
              onRetry={() => scheduleQuery.refetch()}
            />
          )}

          {schedulingEnabled && optimization && !scheduleQuery.isError && (
            <>
              <div className="grid gap-4 md:grid-cols-4">
                <MetricTile icon={Zap} label="Total CO2 Saved" value={formatCo2(savings?.totalSavedCo2)} />
                <MetricTile icon={Cpu} label="Window Utilization" value={`${formatNumber(result?.utilizationPercent, 1)}%`} />
                <MetricTile icon={ListChecks} label="Selected Tasks" value={selectedTasks.length} />
                <MetricTile icon={PauseCircle} label="Deferred Tasks" value={deferredTasks.length} />
              </div>

              <GlassCard>
                <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-amber-400" /> Optimization Results
                </h3>
                <div className="grid gap-3 text-sm md:grid-cols-2 mb-6">
                  <SummaryRow label="Algorithm Used" value={result?.method ?? method} />
                  <SummaryRow label="Optimization Timestamp" value={formatDateTime(result?.createdAt)} />
                  <SummaryRow label="Green Window Used" value={greenWindowLabel} />
                  <SummaryRow label="Carbon Reduction" value={`${formatNumber(savings?.reductionPercent, 1)}%`} />
                </div>
                {renderTaskRows(selectedTasks, 'No tasks selected for this Green Window.')}
              </GlassCard>

              <GlassCard>
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <PauseCircle className="w-5 h-5 text-slate-400" /> Deferred Tasks
                </h3>
                {renderTaskRows(deferredTasks, 'Every pending task was selected for this Green Window.')}
              </GlassCard>
            </>
          )}
        </div>
      </div>
    </div>
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

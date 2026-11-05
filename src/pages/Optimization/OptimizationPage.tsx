import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CalendarClock,
  Check,
  Clock3,
  Leaf,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import { useAuth } from '@/features/auth/AuthProvider';
import { useZone } from '@/app/ZoneProvider';
import { useActivityMutations } from '@/features/activities/hooks/useActivitiesQuery';
import { useOptimizationActivities, useOptimizationSchedule } from '@/features/optimization/hooks/useOptimization';
import { useCarbon } from '@/features/carbon/hooks/useCarbon';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { GlassCard } from '@/components/ui/GlassCard';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import type { SchedulingRecommendation, Task } from '@/types/domain';

const OPTIMIZABLE_STATUSES = new Set<Task['status']>(['idle', 'pending', 'paused', 'delayed']);

export function OptimizationPage() {
  const navigate = useNavigate();
  const { selectedZone } = useZone();
  const { user } = useAuth();
  const [refreshToken, setRefreshToken] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [schedulingIds, setSchedulingIds] = useState<Set<string>>(() => new Set());
  const [scheduleMessages, setScheduleMessages] = useState<Record<string, string>>({});
  const previousForecastSignature = useRef<string | null>(null);
  const { scheduleMutation } = useActivityMutations();
  const {
    data: activities = [],
    isLoading: activitiesLoading,
    isError: activitiesIsError,
    error: activitiesError,
    refetch: refetchActivities,
  } = useOptimizationActivities(user?.id ?? null, user?.organizationId ?? null);
  const { data: carbon } = useCarbon(selectedZone);

  const forecastSignature = carbon
    ? JSON.stringify(carbon.forecast.map(({ datetime, carbonIntensity }) => [datetime, carbonIntensity]))
    : null;

  useEffect(() => {
    if (!forecastSignature) return;
    if (previousForecastSignature.current !== null
      && previousForecastSignature.current !== forecastSignature) {
      setRefreshToken((token) => token + 1);
    }
    previousForecastSignature.current = forecastSignature;
  }, [forecastSignature]);

  const activitiesToOptimize = useMemo(
    () => activities.filter((activity) => OPTIMIZABLE_STATUSES.has(activity.status)),
    [activities],
  );
  const fileUploadActivities = activitiesToOptimize.filter(
    (activity) => activity.activityType === 'file-upload',
  );
  const optimizerActivities = activitiesToOptimize.filter(
    (activity) => activity.activityType !== 'file-upload',
  );
  const scheduledCount = activities.filter((activity) => activity.status === 'scheduled').length;
  const scheduleQuery = useOptimizationSchedule(
    optimizerActivities,
    null,
    'greedy',
    optimizerActivities.length > 0 && Boolean(selectedZone),
    selectedZone ?? undefined,
    user?.id,
    user?.organizationId,
    activities,
    refreshToken,
  );
  const optimization = scheduleQuery.data;
  const selectedTasks = optimization?.result.selectedTasks ?? [];
  const recommendationsById = useMemo(
    () => new Map((optimization?.recommendations ?? []).map((item) => [item.activityId, item])),
    [optimization?.recommendations],
  );
  const tasksById = useMemo(
    () => new Map(optimizerActivities.map((activity) => [activity.id, activity])),
    [optimizerActivities],
  );
  const deferred = [
    ...(optimization?.recommendations ?? [])
      .filter((recommendation) => recommendation.status !== 'scheduled')
      .flatMap((recommendation) => {
        const task = tasksById.get(recommendation.activityId);
        return task ? [{ task, recommendation }] : [];
      }),
    ...fileUploadActivities.map((task) => ({
      task,
      recommendation: {
        activityId: task.id,
        recommendation: 'Manage upload',
        reason: 'File uploads must be scheduled through the upload workflow.',
        status: 'not_scheduled' as const,
        windowId: null,
        startTime: null,
      },
    })),
  ];

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const refreshed = await refetchActivities();
      if (!refreshed.isError) setRefreshToken((token) => token + 1);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleApprove = async (task: Task, recommendation: SchedulingRecommendation) => {
    if (!selectedZone || !recommendation.windowId) return;
    setSchedulingIds((current) => new Set(current).add(task.id));
    setScheduleMessages((current) => ({ ...current, [task.id]: '' }));
    try {
      const response = await scheduleMutation.mutateAsync({
        id: task.id,
        request: { windowId: recommendation.windowId, zone: selectedZone },
      });
      if (!response.scheduled || response.activity?.status !== 'scheduled') {
        setScheduleMessages((current) => ({
          ...current,
          [task.id]: response.recommendation?.reason
            || 'This activity could not be scheduled. Its status has not changed.',
        }));
        return;
      }
      setScheduleMessages((current) => ({ ...current, [task.id]: 'Schedule approved and saved.' }));
    } catch (error) {
      setScheduleMessages((current) => ({
        ...current,
        [task.id]: error instanceof Error ? error.message : 'Scheduling failed. Please try again.',
      }));
    } finally {
      setSchedulingIds((current) => {
        const next = new Set(current);
        next.delete(task.id);
        return next;
      });
    }
  };

  if (activitiesLoading) {
    return (
      <div className="page-shell page-stack">
        <LoadingSkeleton count={1} height="h-14" variant="row" />
        <LoadingSkeleton count={1} height="h-28" />
        <LoadingSkeleton count={2} height="h-52" />
      </div>
    );
  }

  if (activitiesIsError) {
    return (
      <div className="page-shell">
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
      <div className="page-shell">
        <ErrorState
          title="Organization unavailable"
          message="Optimization requires an authenticated organization context."
        />
      </div>
    );
  }

  if (optimizerActivities.length > 0 && !selectedZone) {
    return (
      <div className="page-shell">
        <ErrorState title="Grid zone required" message="Select a grid zone before running optimization." />
      </div>
    );
  }

  const recommendedCount = selectedTasks.length;
  const attentionCount = deferred.length;
  const waitingForRecommendations = optimizerActivities.length > 0
    && scheduleQuery.isFetching
    && !optimization;
  const resultUnavailable = optimizerActivities.length > 0 && !optimization;
  const insight = scheduleQuery.isError && optimizerActivities.length > 0
    ? 'Recommendations could not be loaded. Refresh to try again.'
    : waitingForRecommendations
      ? 'Checking activity timing against the latest forecast.'
      : getInsight(
        recommendedCount,
        attentionCount,
        activitiesToOptimize.length,
        scheduledCount,
        fileUploadActivities.length,
      );

  return (
    <div className="page-shell page-stack">
      <header className="page-header">
        <div>
          <h1 className="page-header-title">Smart Optimization</h1>
          <p className="page-header-subtitle">Your activities, planned intelligently.</p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <Button
            type="button"
            variant="secondary"
            onClick={() => void handleRefresh()}
            disabled={isRefreshing || scheduleQuery.isFetching}
            iconLeft={isRefreshing || scheduleQuery.isFetching
              ? <LoaderCircle className="animate-spin" />
              : <RefreshCw />}
          >
            Refresh recommendations
          </Button>
          <p className="text-xs text-slate-500" aria-live="polite">
            Last updated: {formatUpdatedAt(optimization?.result.createdAt)}
          </p>
        </div>
      </header>

      <GlassCard className="flex items-start gap-4 border-green-500/15 bg-gradient-to-r from-green-500/[0.08] to-transparent">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-green-500/20 bg-green-500/10 text-green-300">
          <Sparkles className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-white">Smart scheduling insight</h2>
          <p className="mt-1 text-sm leading-6 text-slate-300">{insight}</p>
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard icon={CalendarClock} label="Recommended activities" value={resultUnavailable ? '—' : recommendedCount} tone="green" />
        <SummaryCard icon={TriangleAlert} label="Activities needing attention" value={resultUnavailable ? '—' : attentionCount} tone="amber" />
        <SummaryCard icon={Check} label="Approved / scheduled" value={scheduledCount} tone="blue" />
      </div>

      {scheduleQuery.isError && (
        <ErrorState
          title="Recommendations could not be refreshed"
          message={scheduleQuery.error.message}
          onRetry={() => setRefreshToken((token) => token + 1)}
        />
      )}

      {scheduleQuery.isFetching && (
        <div role="status" className="flex items-center gap-2 text-sm text-slate-400">
          <LoaderCircle className="h-4 w-4 animate-spin text-green-400" />
          Updating your recommendations…
        </div>
      )}

      <section aria-labelledby="recommended-heading">
        <GlassCard>
          <SectionHeading
            icon={Leaf}
            title="Recommended Activities"
            description="A lower-carbon time that fits each activity."
            id="recommended-heading"
          />
          {!scheduleQuery.isError && recommendedCount === 0 && !scheduleQuery.isFetching && (
            <p className="py-6 text-sm text-slate-400">
              {optimizerActivities.length === 0
                ? (fileUploadActivities.length > 0
                  ? 'File uploads are scheduled through the upload workflow.'
                  : 'No activities need a new recommendation right now.')
                : 'No activities fit the available lower-carbon times.'}
            </p>
          )}
          {selectedTasks.length > 0 && (
            <ul className="divide-y divide-white/[0.07]">
              {selectedTasks.map((task) => {
                const recommendation = recommendationsById.get(task.id);
                if (!recommendation) return null;
                const isScheduling = schedulingIds.has(task.id);
                return (
                  <li key={task.id} className="flex flex-col gap-4 py-5 first:pt-1 last:pb-1 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-white">{task.name}</h3>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                        <span className="inline-flex items-center gap-1.5 text-slate-300">
                          <CalendarClock className="h-3.5 w-3.5 text-green-400" />
                          {formatRecommendedTime(task)}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Clock3 className="h-3.5 w-3.5" />
                          {task.duration} min
                        </span>
                      </div>
                      <p className="mt-2 max-w-2xl text-sm leading-5 text-slate-400">
                        {recommendation.reason}
                      </p>
                      {scheduleMessages[task.id] && (
                        <p role="status" className="mt-2 text-xs text-green-300">{scheduleMessages[task.id]}</p>
                      )}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="shrink-0"
                      disabled={isScheduling || !recommendation.windowId}
                      onClick={() => void handleApprove(task, recommendation)}
                      iconLeft={isScheduling ? <LoaderCircle className="animate-spin" /> : <Check />}
                    >
                      {isScheduling ? 'Saving…' : 'Approve schedule'}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </GlassCard>
      </section>

      <section aria-labelledby="attention-heading">
        <GlassCard>
          <SectionHeading
            icon={TriangleAlert}
            title="Needs Your Attention"
            description="Why there is no optimizer time yet, and what to do next."
            id="attention-heading"
          />
          {deferred.length === 0 && !scheduleQuery.isError && !scheduleQuery.isFetching && (
            <p className="py-6 text-sm text-slate-400">
              {activitiesToOptimize.length === 0
                ? 'Nothing needs attention.'
                : optimizerActivities.length === 0
                  ? 'File uploads can be scheduled through the upload workflow.'
                  : 'All activities have a recommended time.'}
            </p>
          )}
          {deferred.length > 0 && (
            <ul className="divide-y divide-white/[0.07]">
              {deferred.map(({ task, recommendation }) => (
                <li key={task.id} className="flex flex-col gap-3 py-5 first:pt-1 last:pb-1 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="font-semibold text-white">{task.name}</h3>
                      <span className="text-xs text-slate-500">{task.duration} min</span>
                    </div>
                    <p className="mt-2 max-w-2xl text-sm leading-5 text-slate-400">{recommendation.reason}</p>
                    {scheduleMessages[task.id] && (
                      <p role="alert" className="mt-2 text-xs text-amber-300">{scheduleMessages[task.id]}</p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="shrink-0 self-start"
                    onClick={() => navigate('/activities')}
                    iconRight={<ArrowRight />}
                  >
                    {getNextAction(task, recommendation)}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      </section>
    </div>
  );
}

function getInsight(
  recommended: number,
  attention: number,
  actionable: number,
  scheduled: number,
  fileUploads: number,
): string {
  if (actionable === 0) {
    return scheduled > 0
      ? 'Your activities are already scheduled. New recommendations will appear when your plans or forecast change.'
      : 'Add an activity to get a personalized scheduling recommendation.';
  }
  if (recommended === 0) {
    if (attention === fileUploads && fileUploads > 0) {
      return `File uploads are scheduled through the upload workflow. Manage ${fileUploads === 1 ? 'the upload' : 'your uploads'} below.`;
    }
    return attention > 0
      ? `No activities fit the current forecast. ${attention - fileUploads} ${attention - fileUploads === 1 ? 'activity needs' : 'activities need'} review${fileUploads > 0 ? '; file uploads use their own scheduling workflow' : ''}.`
      : 'There are no new scheduling recommendations at the moment.';
  }
  if (attention === 0) {
    return `${recommended} ${recommended === 1 ? 'activity has' : 'activities have'} a feasible lower-carbon time. Review and approve when ready.`;
  }
  return `${recommended} ${recommended === 1 ? 'activity has' : 'activities have'} a feasible lower-carbon time; ${attention} ${attention === 1 ? 'needs' : 'need'} attention.`;
}

function formatUpdatedAt(value?: string) {
  if (!value) return 'Not yet generated';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Not available';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatRecommendedTime(task: Task) {
  const startValue = task.recommendedStartTime ?? task.scheduledStartTime;
  if (!startValue) return 'Time unavailable';
  const start = new Date(startValue);
  if (!Number.isFinite(start.getTime())) return 'Time unavailable';
  const end = task.scheduledEndTime
    ? new Date(task.scheduledEndTime)
    : new Date(start.getTime() + task.duration * 60_000);
  const dateText = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(start);
  const timeFormatter = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${dateText} · ${timeFormatter.format(start)}–${timeFormatter.format(end)}`;
}

function getNextAction(task: Task, recommendation: SchedulingRecommendation) {
  if (task.activityType === 'file-upload') return 'Manage upload';
  if (recommendation.reason.toLowerCase().includes('deadline')) return 'Review deadline';
  return 'Review activity';
}

function SectionHeading({
  icon: Icon,
  title,
  description,
  id,
}: {
  icon: typeof Leaf;
  title: string;
  description: string;
  id: string;
}) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
      <div>
        <h2 id={id} className="text-base font-semibold text-white">{title}</h2>
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      </div>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Leaf;
  label: string;
  value: number | string;
  tone: 'green' | 'amber' | 'blue';
}) {
  const iconColor = {
    green: 'text-green-400',
    amber: 'text-amber-400',
    blue: 'text-blue-400',
  }[tone];
  return (
    <GlassCard padding="sm" className="flex items-center gap-3">
      <Icon className={`h-4 w-4 shrink-0 ${iconColor}`} />
      <div>
        <p className="text-xs text-slate-400">{label}</p>
        <p className="mt-1 text-xl font-semibold leading-none text-white">{value}</p>
      </div>
    </GlassCard>
  );
}

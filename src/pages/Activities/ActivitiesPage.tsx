import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Plus, Filter } from 'lucide-react';
import { useActivitiesQuery, useActivityMutations } from '@/features/activities/hooks/useActivitiesQuery';
import { useCarbon } from '@/features/carbon/hooks/useCarbon';
import { useZone } from '@/app/ZoneProvider';
import { useSimulationConfig } from '@/features/optimization/hooks/useOptimization';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ActivityCard } from '@/features/activities/components/ActivityCard';
import { CreateActivityModal } from '@/features/activities/components/CreateActivityModal';
import {
  registerUpload,
  uploadService,
  type UploadRegistration,
  type UploadStatus,
} from '@/services/uploadService';
import type { Task } from '@/types/domain';

type TabStatus = 'all' | 'pending' | 'scheduled' | 'running' | 'completed';

const matchesStatusTab = (status: Task['status'], tab: TabStatus) =>
  status.toLowerCase() === tab;

const TABS: { value: TabStatus; label: string }[] = [
  { value: 'all',       label: 'All' },
  { value: 'pending',   label: 'Pending' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'running',   label: 'Running' },
  { value: 'completed', label: 'Completed' },
];

type UploadCardState = {
  progress: number;
  status: UploadStatus | 'registering';
  message?: string;
  recommendationReason?: string;
  upload?: UploadRegistration;
  selectedFilename?: string;
  selectedSize?: number;
};

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([
  '.csv', '.json', '.txt', '.zip', '.bin', '.pt', '.pth', '.ckpt', '.safetensors',
]);

export function ActivitiesPage() {
  const { selectedZone } = useZone();
  const { data: carbon } = useCarbon(selectedZone);
  const { data: simulationConfig } = useSimulationConfig();
  const [activeTab, setActiveTab] = useState<TabStatus>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [uploadStates, setUploadStates] = useState<Record<string, UploadCardState>>({});
  const [schedulingIds, setSchedulingIds] = useState<Set<string>>(new Set());
  const [scheduleMessages, setScheduleMessages] = useState<Record<string, string>>({});
  const [schedulingErrors, setSchedulingErrors] = useState<Record<string, string>>({});
  const [executionMessages, setExecutionMessages] = useState<Record<string, string>>({});
  const [deleteError, setDeleteError] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File>>({});
  const [executingIds, setExecutingIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingFileActionRef = useRef<{ activity: Task } | null>(null);
  const activeUploadsRef = useRef<Set<string>>(new Set());
  const schedulingIdsRef = useRef<Set<string>>(new Set());
  const executingIdsRef = useRef<Set<string>>(new Set());
  const uploadRegistrationKeysRef = useRef(
    new Map<string, { signature: string; key: string }>(),
  );

  const { data: activitiesData, isLoading, isError, refetch } = useActivitiesQuery(
    1,
    200,
    activeTab === 'all' ? undefined : activeTab,
  );
  const { createMutation, updateMutation, deleteMutation, scheduleMutation, runMutation } = useActivityMutations();

  const setUploadState = (id: string, state: UploadCardState) => {
    setUploadStates((prev) => ({ ...prev, [id]: state }));
  };

  const scheduleActivity = async (activity: Task) => {
    if (schedulingIdsRef.current.has(activity.id)) return;
    schedulingIdsRef.current.add(activity.id);
    setSchedulingIds((current) => new Set(current).add(activity.id));
    setScheduleMessages((current) => ({ ...current, [activity.id]: '' }));
    setSchedulingErrors((current) => ({ ...current, [activity.id]: '' }));
    try {
      const response = await scheduleMutation.mutateAsync(activity.id);
      if (!response.scheduled || !response.activity) {
        setScheduleMessages((current) => ({
          ...current,
          [activity.id]: response.recommendation?.reason || 'No feasible scheduling window is available. The activity status is unchanged.',
        }));
      } else {
        setScheduleMessages((current) => ({
          ...current,
          [activity.id]: response.recommendation?.reason || 'Schedule saved from the optimizer recommendation.',
        }));
      }
    } catch (error) {
      setSchedulingErrors((current) => ({ ...current, [activity.id]: error instanceof Error ? error.message : 'Scheduling failed' }));
    } finally {
      setSchedulingIds((current) => {
        const next = new Set(current);
        next.delete(activity.id);
        return next;
      });
      schedulingIdsRef.current.delete(activity.id);
      void refetch();
    }
  };

  const runActivityNow = async (activity: Task) => {
    if (executingIdsRef.current.has(activity.id)) return;
    executingIdsRef.current.add(activity.id);
    setExecutingIds((current) => new Set(current).add(activity.id));
    setExecutionMessages((current) => ({ ...current, [activity.id]: '' }));
    try {
      if (activity.status === 'pending' || activity.status === 'idle') {
        const schedRes = await scheduleMutation.mutateAsync(activity.id);
        if (!schedRes.scheduled || !schedRes.activity) {
          throw new Error(schedRes.recommendation?.reason || 'No feasible Green Window available to schedule and run this activity.');
        }
      }
      await runMutation.mutateAsync(activity.id);
    } catch (error) {
      setExecutionMessages((current) => ({ ...current, [activity.id]: error instanceof Error ? error.message : 'Could not start the run' }));
    } finally {
      executingIdsRef.current.delete(activity.id);
      setExecutingIds((current) => {
        const next = new Set(current);
        next.delete(activity.id);
        return next;
      });
      void refetch();
    }
  };

  const confirmDelete = async (activityId: string) => {
    const activity = activitiesData?.items.find((item) => item.id === activityId);
    if (!activity || !window.confirm(`Delete activity “${activity.name}”? This cannot be undone.`)) return;
    setDeleteError('');
    try {
      await deleteMutation.mutateAsync(activity.id);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Could not delete activity');
    }
  };

  useEffect(() => {
    let cancelled = false;
    const activities = activitiesData?.items.filter((item) => item.activityType === 'file-upload') ?? [];
    void Promise.all(activities.map(async (activity) => {
      const response = await uploadService.getActivityUploads(activity.id);
      if (!response.success || !response.data) {
        throw new Error(response.error || `Could not load upload history for ${activity.name}`);
      }
      return { activityId: activity.id, upload: response.data[0] };
    })).then((items) => {
      if (cancelled) return;
      setUploadStates((previous) => {
        const next = { ...previous };
        for (const { activityId, upload } of items) {
          if (next[activityId]?.status === 'registering') continue;
          if (upload) {
            next[activityId] = {
              progress: upload.status === 'completed' ? 100 : 0,
              status: upload.status,
              upload,
              ...(upload.recommendationReason
                ? { recommendationReason: upload.recommendationReason }
                : {}),
              ...(upload.error ? { message: upload.error } : {}),
            };
          } else {
            delete next[activityId];
          }
        }
        return next;
      });
    }).catch((error: unknown) => {
      if (!cancelled) {
        setUploadStates((previous) => ({
          ...previous,
          ...(activities[0] ? {
            [activities[0].id]: {
              ...(previous[activities[0].id] ?? { progress: 0, status: 'pending' as const }),
              message: error instanceof Error ? error.message : 'Could not load upload history',
            },
          } : {}),
        }));
      }
    });
    return () => { cancelled = true; };
  }, [activitiesData?.items]);

  useEffect(() => {
    const input = fileInputRef.current;
    if (!input) return;
    const handleCancel = () => { pendingFileActionRef.current = null; };
    input.addEventListener('cancel', handleCancel);
    return () => input.removeEventListener('cancel', handleCancel);
  }, [isLoading]);

  const executeRegistered = async (
    activity: Task,
    upload: UploadRegistration,
    runNow: boolean,
  ) => {
    if (activeUploadsRef.current.has(upload.id)) return;
    activeUploadsRef.current.add(upload.id);
    setExecutingIds((current) => new Set(current).add(activity.id));
    try {
      const response = await uploadService.execute(upload.id, runNow);
      if (!response.success || !response.data) {
        const latest = await uploadService.getStatus(upload.id);
        const persisted = latest.success && latest.data ? latest.data : upload;
        setUploadState(activity.id, {
          progress: persisted.status === 'completed' ? 100 : 0,
          status: persisted.status,
          upload: persisted,
          message: response.error || latest.error || 'Upload execution failed',
          ...(persisted.recommendationReason
            ? { recommendationReason: persisted.recommendationReason }
            : {}),
        });
        return;
      }
      setUploadState(activity.id, {
        progress: response.data.status === 'completed' ? 100 : 0,
        status: response.data.status,
        upload: response.data,
        ...(response.data.recommendationReason
          ? { recommendationReason: response.data.recommendationReason }
          : {}),
      });
    } catch (error) {
      setUploadState(activity.id, {
        progress: 0,
        status: upload.status,
        upload,
        message: error instanceof Error ? error.message : 'Upload execution failed',
      });
    } finally {
      activeUploadsRef.current.delete(upload.id);
      setExecutingIds((current) => {
        const next = new Set(current);
        next.delete(activity.id);
        return next;
      });
      void refetch();
    }
  };

  const scheduleRegistered = async (activity: Task, upload: UploadRegistration) => {
    if (schedulingIdsRef.current.has(activity.id)) return;
    schedulingIdsRef.current.add(activity.id);
    setSchedulingIds((current) => new Set(current).add(activity.id));
    setScheduleMessages((current) => ({ ...current, [activity.id]: '' }));
    setSchedulingErrors((current) => ({ ...current, [activity.id]: '' }));
    try {
      const response = await uploadService.schedule(upload.id);
      if (!response.success || !response.data) {
        setUploadState(activity.id, {
          progress: 0,
          status: upload.status,
          upload,
          message: response.error || 'No permitted recommendation is available.',
        });
        setSchedulingErrors((current) => ({
          ...current,
          [activity.id]: response.error || 'No permitted recommendation is available.',
        }));
        return;
      }
      const scheduleData = response.data;
      setUploadState(activity.id, {
        progress: 0,
        status: 'scheduled',
        upload: scheduleData.upload,
        recommendationReason: scheduleData.recommendation.reason,
      });
      setScheduleMessages((current) => ({
        ...current,
        [activity.id]: scheduleData.recommendation.reason,
      }));
    } catch (error) {
      setSchedulingErrors((current) => ({
        ...current,
        [activity.id]: error instanceof Error ? error.message : 'Scheduling failed',
      }));
    } finally {
      setSchedulingIds((current) => {
        const next = new Set(current);
        next.delete(activity.id);
        return next;
      });
      schedulingIdsRef.current.delete(activity.id);
      void refetch();
    }
  };

  const runRegisteredNow = async (activity: Task, upload: UploadRegistration) => {
    await executeRegistered(activity, upload, true);
    void refetch();
  };

  const startUpload = async (activity: Task, file: File) => {
    const selectedFile = {
      selectedFilename: file.name,
      selectedSize: file.size,
    };
    const extension = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`;
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      setUploadState(activity.id, {
        progress: 0,
        status: 'failed',
        message: 'Unsupported file type. Choose CSV, JSON, TXT, ZIP, or a supported checkpoint file.',
        ...selectedFile,
      });
      return;
    }
    if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
      setUploadState(activity.id, {
        progress: 0,
        status: 'failed',
        message: file.size === 0 ? 'The selected file is empty.' : 'File exceeds the 100 MiB size limit.',
        ...selectedFile,
      });
      return;
    }

    setUploadState(activity.id, {
      progress: 0,
      status: 'registering',
      ...selectedFile,
    });
    const signature = JSON.stringify([file.name, file.size, file.type, file.lastModified]);
    const previousRequest = uploadRegistrationKeysRef.current.get(activity.id);
    const idempotencyKey = previousRequest?.signature === signature
      ? previousRequest.key
      : crypto.randomUUID();
    uploadRegistrationKeysRef.current.set(activity.id, { signature, key: idempotencyKey });
    let registered;
    try {
      registered = await registerUpload(activity.id, file, (progress) => {
        setUploadState(activity.id, {
          progress,
          status: 'registering',
          ...selectedFile,
        });
      }, idempotencyKey);
    } catch (error) {
      setUploadState(activity.id, {
        progress: 0,
        status: 'failed',
        message: error instanceof Error ? error.message : 'Could not register upload',
        ...selectedFile,
      });
      return;
    }
    if (!registered.success || !registered.data) {
      setUploadState(activity.id, {
        progress: 0,
        status: 'failed',
        message: registered.error || 'Could not register upload',
        ...selectedFile,
      });
      return;
    }
    setUploadState(activity.id, {
      progress: 0,
      status: 'pending',
      upload: registered.data,
    });

    void refetch();
  };

  const openFilePicker = (activity: Task) => {
    pendingFileActionRef.current = { activity };
    const input = fileInputRef.current;
    if (!input) {
      setUploadState(activity.id, { progress: 0, status: 'failed', message: 'File picker is unavailable.' });
      return;
    }
    input.value = '';
    try {
      if (typeof input.showPicker === 'function') input.showPicker();
      else input.click();
    } catch {
      try {
        input.click();
      } catch (error) {
        pendingFileActionRef.current = null;
        setUploadState(activity.id, {
          progress: 0,
          status: 'failed',
          message: error instanceof Error ? error.message : 'Could not open the file picker.',
        });
      }
    }
  };

  const handleFileSelection = async (event: ChangeEvent<HTMLInputElement>) => {
    const pendingAction = pendingFileActionRef.current;
    pendingFileActionRef.current = null;
    if (!pendingAction) return;
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      setUploadState(pendingAction.activity.id, {
        progress: 0,
        status: 'pending',
        message: 'No file was selected. The existing upload was not changed.',
      });
      return;
    }
    setSelectedFiles((current) => ({ ...current, [pendingAction.activity.id]: file }));
  };

  if (isLoading) {
    return (
      <div className="page-shell page-stack activities-page">
        <LoadingSkeleton count={1} height="h-16" variant="row" />
        <LoadingSkeleton count={1} height="h-14" variant="row" />
        <div className="card-grid card-grid-sm-2 card-grid-lg-3 activities-grid">
          <LoadingSkeleton count={3} height="h-52" />
        </div>
      </div>
    );
  }

  if (isError || !activitiesData) {
    return (
      <div className="page-shell activities-page">
        <ErrorState onRetry={() => refetch()} />
      </div>
    );
  }

  const tasks = activeTab === 'all'
    ? activitiesData.items
    : activitiesData.items.filter((task) => matchesStatusTab(task.status, activeTab));

  return (
  <div className="page-shell page-stack activities-page">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.json,.txt,.zip,.bin,.pt,.pth,.ckpt,.safetensors"
        aria-label="Choose an activity file to upload"
        className="sr-only"
        onChange={handleFileSelection}
      />
        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="page-header activities-header">
          <div>
            <h1 className="page-header-title heading-row">
              Digital Workloads
              <span className="ds-badge bg-amber-500/10 text-amber-400 border-amber-500/20">
                {activitiesData.total} Total
              </span>
            </h1>
            <p className="page-header-subtitle">
              Register, monitor, and manage carbon-aware digital workloads with full lifecycle status controls.
            </p>
          </div>

          <div className="cluster">
            <Button size="sm" onClick={() => setIsModalOpen(true)} iconLeft={<Plus className="w-3.5 h-3.5" />}>
              Register Activity
            </Button>
          </div>
        </div>

        {/* ── Segment control tabs ────────────────────────────────────────────── */}
        {deleteError && <p role="alert" className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-300">{deleteError}</p>}
        <div className="segment-control activities-segment w-full sm:w-auto">
          {TABS.map(({ value, label }) => {
            const count = value === 'all'
              ? activitiesData.statusCounts
                ? Object.values(activitiesData.statusCounts).reduce((sum, value) => sum + (value ?? 0), 0)
                : activeTab === 'all' ? activitiesData.total : activitiesData.items.length
              : activitiesData.statusCounts?.[value]
                ?? activitiesData.items.filter((task) => matchesStatusTab(task.status, value)).length;

            return (
              <button
                key={value}
                onClick={() => setActiveTab(value)}
                className={`segment-tab ${activeTab === value ? 'active' : ''}`}
                aria-current={activeTab === value ? 'page' : undefined}
              >
                {label}
                {count > 0 && (
                  <span className={`ds-badge ml-0.5 px-1.5 py-0.5 ${
                    activeTab === value
                      ? 'bg-white/10 text-white'
                      : 'bg-white/[0.05] text-slate-500'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Activity grid ───────────────────────────────────────────────────── */}
        {tasks.length === 0 ? (
          <EmptyState
            icon={Filter}
            title="No activities in this status"
            description="Register a new digital workload or switch tabs to see other workloads."
            actionLabel="Register Activity"
            onAction={() => setIsModalOpen(true)}
            accentColor="amber"
          />
        ) : (
          <div className="card-grid card-grid-sm-2 card-grid-lg-3 activities-grid">
            {tasks.map((task) => (
              <ActivityCard
                key={task.id}
                activity={task}
                carbonIntensity={carbon?.current.carbonIntensity}
                carbonIsSimulated={carbon?.isSimulated}
                baselineIntensity={simulationConfig?.baselineIntensity}
                onUpdateStatus={(id, status, scheduledStartTime) =>
                  updateMutation.mutate({ id, update: { status, scheduledStartTime } })
                }
                onRunNow={(activity) => {
                  const current = uploadStates[activity.id]?.upload;
                  if (current) void runRegisteredNow(activity, current);
                }}
                onScheduleUpload={(activity) => {
                  const current = uploadStates[activity.id]?.upload;
                  if (current) void scheduleRegistered(activity, current);
                }}
                onChooseFile={(activity) => openFilePicker(activity)}
                onScheduleActivity={(activity) => void scheduleActivity(activity)}
                onRunActivity={(activity) => void runActivityNow(activity)}
                scheduling={schedulingIds.has(task.id)}
                executing={executingIds.has(task.id)}
                deleting={deleteMutation.isPending}
                schedulingReason={scheduleMessages[task.id]}
                schedulingError={schedulingErrors[task.id]}
                executionMessage={executionMessages[task.id]}
                selectedFile={selectedFiles[task.id]}
                onUploadSelected={() => {
                  const selected = selectedFiles[task.id];
                  if (!selected) return;
                  setSelectedFiles((current) => {
                    const next = { ...current };
                    delete next[task.id];
                    return next;
                  });
                  void startUpload(task, selected);
                }}
                onDelete={(id) => void confirmDelete(id)}
                uploadState={uploadStates[task.id]}
              />
            ))}
          </div>
        )}

        {/* ── Modal ──────────────────────────────────────────────────────────── */}
        <CreateActivityModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSubmit={async (newTask, idempotencyKey) => {
            const response = await createMutation.mutateAsync({ task: newTask, idempotencyKey });
            if (!response.success || !response.data) {
              throw new Error(response.error || 'Could not register the activity.');
            }
            await refetch();
          }}
        />
    </div>
  );
}

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
import { optimizerService } from '@/services/optimizerService';
import type { Task } from '@/types/domain';

type TabStatus = 'all' | 'pending' | 'scheduled' | 'running' | 'completed';

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingFileActionRef = useRef<{
    activity: Task;
    mode: 'run' | 'schedule';
  } | null>(null);
  const activeUploadsRef = useRef<Set<string>>(new Set());
  const uploadRegistrationKeysRef = useRef(
    new Map<string, { signature: string; key: string }>(),
  );

  const { data: activitiesData, isLoading, isError, refetch } = useActivitiesQuery(1, 200);
  const { createMutation, updateMutation, deleteMutation } = useActivityMutations();

  const setUploadState = (id: string, state: UploadCardState) => {
    setUploadStates((prev) => ({ ...prev, [id]: state }));
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
    recommendationReason?: string,
  ) => {
    if (activeUploadsRef.current.has(upload.id)) return;
    activeUploadsRef.current.add(upload.id);
    setUploadState(activity.id, {
      progress: 0,
      status: 'running',
      upload,
      ...((recommendationReason || upload.recommendationReason)
        ? { recommendationReason: recommendationReason || upload.recommendationReason || undefined }
        : {}),
    });
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
      void refetch();
    }
  };

  const scheduleRegistered = async (activity: Task, upload: UploadRegistration) => {
    const response = await uploadService.schedule(upload.id);
    if (!response.success || !response.data) {
      setUploadState(activity.id, {
        progress: 0,
        status: upload.status,
        upload,
        message: response.error || 'No permitted recommendation is available.',
      });
      return;
    }
    setUploadState(activity.id, {
      progress: 0,
      status: 'scheduled',
      upload: response.data.upload,
      recommendationReason: response.data.recommendation.reason,
    });
    void refetch();
  };

  const getRecommendation = async (activity: Task) => {
    const response = await optimizerService.runScheduler({
      tasks: [activity],
      method: 'greedy',
      zone: activity.zone,
    });
    if (!response.success || !response.data) {
      throw new Error(response.error || 'Could not obtain an optimizer recommendation');
    }
    const recommendation = response.data.recommendations.find((item) => item.activityId === activity.id);
    if (!recommendation) {
      throw new Error('The optimizer returned no recommendation for this activity.');
    }
    return recommendation;
  };

  const runRegisteredNow = async (activity: Task, upload: UploadRegistration) => {
    let recommendationReason: string;
    try {
      const recommendation = await getRecommendation(activity);
      recommendationReason = recommendation.reason;
      setUploadState(activity.id, {
        progress: 0,
        status: upload.status,
        upload,
        recommendationReason: recommendation.reason,
      });
    } catch (error) {
      setUploadState(activity.id, {
        progress: 0,
        status: upload.status,
        upload,
        message: error instanceof Error ? error.message : 'Recommendation failed; upload remains pending.',
      });
      return;
    }
    await executeRegistered(activity, upload, true, recommendationReason);
    void refetch();
  };

  const startUpload = async (activity: Task, file: File, mode: 'run' | 'schedule') => {
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

    if (mode === 'schedule') {
      const scheduled = await uploadService.schedule(registered.data.id);
      if (!scheduled.success || !scheduled.data) {
        setUploadState(activity.id, {
          progress: 0,
          status: 'pending',
          upload: registered.data,
          message: scheduled.error || 'No permitted recommendation is available; upload remains pending.',
        });
        return;
      }
      setUploadState(activity.id, {
        progress: 0,
        status: 'scheduled',
        upload: scheduled.data.upload,
        recommendationReason: scheduled.data.recommendation.reason,
      });
      void refetch();
      return;
    }

    try {
      const recommendation = await getRecommendation(activity);
      await executeRegistered(activity, registered.data, true, recommendation.reason);
    } catch (error) {
      setUploadState(activity.id, {
        progress: 0,
        status: 'pending',
        upload: registered.data,
        message: error instanceof Error ? error.message : 'Recommendation failed; upload remains pending.',
      });
    }
  };

  const openFilePicker = (activity: Task, mode: 'run' | 'schedule') => {
    pendingFileActionRef.current = { activity, mode };
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
    await startUpload(pendingAction.activity, file, pendingAction.mode);
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
    : activitiesData.items.filter((task) => task.status === activeTab);

  return (
  <div className="page-shell page-stack activities-page">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.json,.txt,.zip,.bin,.pt,.pth,.ckpt,.safetensors"
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
        <div className="segment-control activities-segment w-full sm:w-auto">
          {TABS.map(({ value, label }) => {
            const count = value === 'all'
              ? activitiesData.total
              : activitiesData.items.filter(t => t.status === value).length;

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
                  else openFilePicker(activity, 'run');
                }}
                onExecuteScheduled={(activity) => {
                  const current = uploadStates[activity.id]?.upload;
                  if (current) void executeRegistered(activity, current, false);
                }}
                onScheduleUpload={(activity) => {
                  const current = uploadStates[activity.id]?.upload;
                  if (current) void scheduleRegistered(activity, current);
                  else openFilePicker(activity, 'schedule');
                }}
                onDelete={(id) => deleteMutation.mutate(id)}
                uploadState={uploadStates[task.id]}
              />
            ))}
          </div>
        )}

        {/* ── Modal ──────────────────────────────────────────────────────────── */}
        <CreateActivityModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSubmit={(newTask, idempotencyKey) =>
            createMutation.mutate({ task: newTask, idempotencyKey })
          }
        />
    </div>
  );
}

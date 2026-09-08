import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Plus, Filter } from 'lucide-react';
import { useActivitiesQuery, useActivityMutations } from '@/features/activities/hooks/useActivitiesQuery';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ActivityCard } from '@/features/activities/components/ActivityCard';
import { CreateActivityModal } from '@/features/activities/components/CreateActivityModal';
import { uploadFiles, type UploadedFile } from '@/services/uploadService';
import type { Task } from '@/types/domain';

type TabStatus = 'all' | 'pending' | 'scheduled' | 'running' | 'completed';

const TABS: { value: TabStatus; label: string }[] = [
  { value: 'all',       label: 'All' },
  { value: 'pending',   label: 'Pending' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'running',   label: 'Running' },
  { value: 'completed', label: 'Completed' },
];

export function ActivitiesPage() {
  const [activeTab, setActiveTab] = useState<TabStatus>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [uploadStates, setUploadStates] = useState<Record<string, {
    progress: number;
    status: 'queued' | 'uploading' | 'success' | 'error';
    message?: string;
    selectedFileName?: string;
    uploadedFile?: UploadedFile;
  }>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingFileActionRef = useRef<{
    activity: Task;
    mode: 'run' | 'schedule';
    scheduledStartTime?: string;
  } | null>(null);
  const queuedFilesRef = useRef<Map<string, File[]>>(new Map());
  const uploadingRef = useRef<Set<string>>(new Set());

  const { data: activitiesData, isLoading, isError, refetch } = useActivitiesQuery(1, 200);
  const { createMutation, updateMutation, deleteMutation } = useActivityMutations();

  const setUploadState = useCallback((id: string, state: {
    progress: number;
    status: 'queued' | 'uploading' | 'success' | 'error';
    message?: string;
    selectedFileName?: string;
    uploadedFile?: UploadedFile;
  }) => {
    setUploadStates((prev) => ({ ...prev, [id]: state }));
  }, []);

  const executeUpload = useCallback(async (activity: Task, files: File[]) => {
    if (uploadingRef.current.has(activity.id)) return;
    uploadingRef.current.add(activity.id);

    const selectedFileName = files.length === 1 ? files[0].name : `${files[0].name} + ${files.length - 1} more`;
    setUploadState(activity.id, { progress: 0, status: 'uploading', selectedFileName });
    await updateMutation.mutateAsync({ id: activity.id, update: { status: 'running', progress: 0 } });

    const result = await uploadFiles(files, (progress) => {
      setUploadState(activity.id, { progress, status: 'uploading', selectedFileName });
    });

    uploadingRef.current.delete(activity.id);
    queuedFilesRef.current.delete(activity.id);

    if (!result.success) {
      setUploadState(activity.id, {
        progress: 0,
        status: 'error',
        message: result.error || 'Upload failed',
        selectedFileName,
      });
      await updateMutation.mutateAsync({ id: activity.id, update: { status: 'failed', progress: 0 } });
      return;
    }

    setUploadState(activity.id, {
      progress: 100,
      status: 'success',
      selectedFileName,
      uploadedFile: result.data?.files?.[0],
    });
    await updateMutation.mutateAsync({ id: activity.id, update: { status: 'completed', progress: 100 } });
  }, [setUploadState, updateMutation]);

  useEffect(() => {
    if (!activitiesData?.items) return;

    for (const activity of activitiesData.items) {
      const files = queuedFilesRef.current.get(activity.id);
      if (
        activity.activityType === 'file-upload' &&
        activity.status === 'running' &&
        files &&
        !uploadingRef.current.has(activity.id)
      ) {
        void executeUpload(activity, files);
      }
    }
  }, [activitiesData?.items, executeUpload]);

  const openFilePicker = (activity: Task, mode: 'run' | 'schedule', scheduledStartTime?: string) => {
    pendingFileActionRef.current = { activity, mode, scheduledStartTime };
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileSelection = async (event: ChangeEvent<HTMLInputElement>) => {
    const pendingAction = pendingFileActionRef.current;
    pendingFileActionRef.current = null;

    if (!pendingAction) return;

    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    const { activity, mode, scheduledStartTime } = pendingAction;
    const selectedFileName = files.length === 1 ? files[0].name : `${files[0].name} + ${files.length - 1} more`;

    if (mode === 'run') {
      queuedFilesRef.current.set(activity.id, files);
      await executeUpload(activity, files);
      return;
    }

    queuedFilesRef.current.set(activity.id, files);
    setUploadState(activity.id, { progress: 0, status: 'queued', selectedFileName });
    updateMutation.mutate({
      id: activity.id,
      update: { status: 'scheduled', scheduledStartTime },
    });
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
    <div className="page-shell page-stack">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelection}
      />
    <div className="page-shell page-stack activities-page">

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
              onUpdateStatus={(id, status, scheduledStartTime) =>
                updateMutation.mutate({ id, update: { status, scheduledStartTime } })
              }
              onRunNow={(activity) => openFilePicker(activity, 'run')}
              onScheduleUpload={(activity, scheduledStartTime) => openFilePicker(activity, 'schedule', scheduledStartTime)}
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
        onSubmit={(newTask) => createMutation.mutate(newTask)}
      />
    </div>
  );
}

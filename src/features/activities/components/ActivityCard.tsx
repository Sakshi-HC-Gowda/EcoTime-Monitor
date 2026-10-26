import { Clock, Zap, Play, Trash2, Calendar, Sparkles, UploadCloud } from 'lucide-react';
import type { Task } from '@/types/domain';
import { GlassCard } from '@/components/ui/GlassCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import {
  getEstimatedCarbonImpact,
  getEstimatedEcoScore,
  getEstimatedEnergyKwh,
  getRecommendationText,
} from '@/features/activities/utils/activityMetrics';
import { uploadService, type UploadRegistration } from '@/services/uploadService';

interface Props {
  activity: Task;
  carbonIntensity?: number;
  carbonIsSimulated?: boolean;
  baselineIntensity?: number;
  onUpdateStatus: (id: string, status: Task['status'], scheduledStartTime?: string) => void;
  onRunNow?: (activity: Task) => void;
  onScheduleUpload?: (activity: Task) => void;
  onChooseFile?: (activity: Task) => void;
  onScheduleActivity?: (activity: Task) => void;
  onRunActivity?: (activity: Task) => void;
  executing?: boolean;
  scheduling?: boolean;
  deleting?: boolean;
  schedulingReason?: string;
  schedulingError?: string;
  executionMessage?: string;
  selectedFile?: File;
  onUploadSelected?: () => void;
  onDelete: (id: string) => void;
  uploadState?: {
    progress: number;
    status: 'registering' | 'pending' | 'scheduled' | 'running' | 'completed' | 'failed';
    message?: string;
    recommendationReason?: string;
    upload?: UploadRegistration;
    selectedFilename?: string;
    selectedSize?: number;
  };
}

const statusAccent: Record<string, string> = {
  running: 'border-t-green-500/40',
  completed: 'border-t-green-500/30',
  scheduled: 'border-t-amber-500/40',
  failed: 'border-t-rose-500/40',
  error: 'border-t-rose-500/40',
  pending: 'border-t-blue-500/30',
  idle: 'border-t-slate-500/20',
};

export function ActivityCard({
  activity,
  carbonIntensity,
  carbonIsSimulated,
  baselineIntensity = 380,
  onUpdateStatus: _onUpdateStatus,
  onRunNow,
  onScheduleUpload,
  onChooseFile,
  onScheduleActivity,
  onRunActivity,
  executing = false,
  scheduling = false,
  deleting = false,
  schedulingReason,
  schedulingError,
  executionMessage,
  selectedFile,
  onUploadSelected,
  onDelete,
  uploadState,
}: Props) {
  const estimatedPower = activity.powerDraw;
  const estimatedEnergy = getEstimatedEnergyKwh(activity);
  const estimatedCarbonImpact = getEstimatedCarbonImpact(activity, carbonIntensity);
  const ecoScore = getEstimatedEcoScore(activity, carbonIntensity, baselineIntensity);
  const recommendation = getRecommendationText(activity);

  const isHighCarbon = estimatedCarbonImpact !== null && estimatedCarbonImpact > 200;
  const topBorderClass = statusAccent[activity.status.toLowerCase()] ?? 'border-t-white/[0.06]';
  const isFileUpload = activity.activityType === 'file-upload';
  const progress = uploadState?.progress ?? activity.progress ?? 0;
  const showUploadStatus = isFileUpload;
  const upload = uploadState?.upload;
  const uploadStatus = uploadState?.status ?? activity.status;
  const uploadHeading = uploadStatus === 'registering'
    ? `Registering${upload ? ` ${upload.filename}` : ' file'}`
    : uploadStatus === 'scheduled'
      ? 'Scheduled'
      : uploadStatus === 'running'
        ? 'Storing upload'
        : uploadStatus === 'completed'
          ? 'Upload completed'
          : uploadStatus === 'failed'
            ? 'Upload failed'
            : upload
              ? 'Upload pending'
              : 'No file registered';

  const formatUploadTime = (value?: string) => {
    if (!value) return 'Not available';
    return new Intl.DateTimeFormat(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value));
  };

  const handleRunNow = () => {
    if (isFileUpload) {
      onRunNow?.(activity);
    } else {
      onRunActivity?.(activity);
    }
  };

  const handleSchedule = () => {
    if (isFileUpload) {
      onScheduleUpload?.(activity);
    } else {
      onScheduleActivity?.(activity);
    }
  };

  return (
    <GlassCard
      hoverEffect
      className={`relative flex flex-col overflow-hidden border-t-2 ${topBorderClass}`}
      padding="none"
    >
      <div className="flex items-start justify-between p-[var(--card-padding-md)] pb-5">
        <div className="min-w-0 pr-3">
          <span className="label-text font-mono">{activity.activityType}</span>
          <h3 className="mt-0.5 text-[15px] font-bold leading-tight text-white">{activity.name}</h3>
        </div>
        <StatusBadge status={activity.status} />
      </div>

      {activity.status === 'scheduled' && activity.scheduledStartTime && (
        <div className="mx-[var(--card-padding-md)] mb-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-3 text-xs">
          <p className="font-semibold text-amber-200">Scheduled for {formatUploadTime(activity.scheduledStartTime)}</p>
          {activity.scheduledEndTime && <p className="mt-1 text-amber-100/80">Expected end {formatUploadTime(activity.scheduledEndTime)}</p>}
          {activity.assignedWindowId && <p className="mt-1 text-slate-400">Green Window {activity.assignedWindowId}</p>}
          {schedulingReason && <p className="mt-1 text-slate-300">{schedulingReason}</p>}
          {!isFileUpload && <p className="mt-1 text-slate-400">Click Run Now to start a simulated workload run.</p>}
        </div>
      )}

      {!isFileUpload && activity.status === 'running' && (
        <div className="mx-[var(--card-padding-md)] mb-4 rounded-xl border border-green-500/20 bg-green-500/[0.05] p-3 text-xs">
          <p className="font-semibold text-green-200">Simulated execution in progress</p>
          <p className="mt-1 text-slate-300">{Math.round(activity.progress)}% complete</p>
          <div className="mt-2 h-1.5 w-full rounded-full bg-white/[0.08]">
            <div className="h-full rounded-full bg-green-400" style={{ width: `${Math.max(0, Math.min(100, activity.progress))}%` }} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 px-[var(--card-padding-md)] pb-5">
        <div className="ds-card p-2.5">
          <span className="label-text mb-1 block">Assumed Power</span>
          <span className="flex items-center gap-1.5 text-xs font-semibold text-white">
            <Clock className="h-3 w-3 flex-shrink-0 text-amber-400" />
            {estimatedPower.toFixed(0)} W
          </span>
        </div>

        <div className="ds-card p-2.5">
          <span className="label-text mb-1 block">Estimated Duration</span>
          <span className="flex items-center gap-1.5 text-xs font-semibold text-white">
            <Clock className="h-3 w-3 flex-shrink-0 text-cyan-400" />
            {activity.duration} min
          </span>
        </div>

        <div className="ds-card p-2.5">
          <span className="label-text mb-1 block">Estimated Energy</span>
          <span className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
            <Zap className="h-3 w-3 flex-shrink-0 text-amber-400" />
            {estimatedEnergy.toFixed(2)} kWh
          </span>
        </div>

        <div className="ds-card p-2.5">
          <span className="label-text mb-1 block">
            Estimated Emissions {carbonIntensity === undefined ? '' : '(current grid)'}
          </span>
          <span className={`text-xs font-bold ${isHighCarbon ? 'text-rose-300' : 'text-green-300'}`}>
            {estimatedCarbonImpact === null ? 'Unavailable without carbon intensity' : `${estimatedCarbonImpact.toFixed(2)} gCO2e`}
          </span>
          {estimatedCarbonImpact !== null && (
            <span className="mt-1 block text-[10px] text-slate-500">
              {carbonIsSimulated ? 'Simulated carbon input' : 'Provider-reported carbon input'}
            </span>
          )}
        </div>

        <div className="ds-card col-span-2 p-2.5">
          <div className="mb-1 flex items-center justify-between gap-3">
            <span className="label-text block">EcoScore</span>
            <span className="text-xs font-bold text-cyan-300">
              {ecoScore === null ? 'Unavailable' : `${ecoScore.toFixed(1)} / 100`}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-cyan-400/80"
              style={{ width: `${Math.max(4, Math.min(100, ecoScore ?? 0))}%` }}
            />
          </div>
          <span className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-slate-300">
            <Sparkles className="h-3 w-3 text-cyan-400" />
            {ecoScore === null ? 'Waiting for valid carbon data' : recommendation}
          </span>
        </div>
      </div>

      {showUploadStatus && (
        <div className="px-[var(--card-padding-md)] pb-4">
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
            <div className="mb-2 flex items-center justify-between gap-3 text-xs">
              <span className="flex items-center gap-1.5 font-semibold text-white">
                <UploadCloud className="h-3.5 w-3.5 text-green-300" />
                {uploadHeading}
              </span>
              <span className="font-mono font-bold text-green-300">{Math.round(progress)}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-white/[0.08]">
              <div
                className="h-full rounded-full bg-green-400 transition-all"
                style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
              />
            </div>

            {!upload && (
              <p className="mt-2 text-xs font-medium text-slate-400">
                Select a CSV, JSON, TXT, ZIP, or checkpoint file (maximum 100 MiB).
              </p>
            )}

            {selectedFile && (
              <div className="mt-3 rounded-lg border border-green-500/20 bg-green-500/[0.05] p-3">
                <p className="break-words text-xs font-semibold text-white">Selected: {selectedFile.name}</p>
                <p className="mt-1 text-xs text-slate-400">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MiB</p>
                <p className="mt-1 text-xs text-slate-400">The file will be stored; its contents are not executed.</p>
                <button
                  type="button"
                  onClick={onUploadSelected}
                  disabled={uploadStatus === 'registering' || uploadStatus === 'running'}
                  className="ds-control mt-3 w-full bg-green-500/80 text-xs font-bold text-white hover:bg-green-500 disabled:opacity-50"
                >
                  Upload file
                </button>
              </div>
            )}

            {(upload || uploadState?.selectedFilename) && (
              <div className="mt-3 space-y-1.5 text-xs">
                <p className="break-words font-semibold text-white">
                  {upload?.filename ?? uploadState?.selectedFilename}
                </p>
                <p className="text-slate-400">
                  {((upload?.size ?? uploadState?.selectedSize ?? 0) / (1024 * 1024)).toFixed(2)} MiB
                </p>
                {upload?.scheduledStartTime && (
                  <p className="text-slate-400">
                    Scheduled for {formatUploadTime(upload.scheduledStartTime)}
                  </p>
                )}
              </div>
            )}

            {uploadStatus === 'scheduled' && (
              <p className="mt-2 text-xs text-amber-200">
                The backend worker stores this file when the scheduled time arrives. File contents are not executed.
              </p>
            )}

            {uploadStatus === 'completed' && upload && (
              <div className="mt-3 rounded-lg border border-green-500/20 bg-green-500/[0.05] p-3">
                <p className="mb-3 text-xs font-bold text-green-300">Upload completed and stored. File contents were not executed.</p>
                <UploadMeta label="File Name" value={upload.filename} />
                <UploadMeta label="Completed At" value={formatUploadTime(upload.uploadedAt ?? undefined)} />
                <button
                  type="button"
                  onClick={() => void uploadService.download(upload)}
                  className="mt-2 text-xs font-semibold text-cyan-300 hover:text-cyan-200"
                >
                  Download uploaded file
                </button>
              </div>
            )}
            {uploadState?.message && (
              <p className="mt-2 text-xs font-medium text-rose-300">{uploadState.message}</p>
            )}
            {uploadState?.recommendationReason && (
              <p className="mt-2 text-xs text-slate-300">{uploadState.recommendationReason}</p>
            )}
          </div>
        </div>
      )}

      {!isFileUpload && schedulingReason && activity.status !== 'scheduled' && (
        <p className="mx-[var(--card-padding-md)] mb-4 text-xs text-rose-300">{schedulingReason}</p>
      )}
      {!isFileUpload && schedulingError && (
        <p role="alert" className="mx-[var(--card-padding-md)] mb-4 text-xs text-rose-300">{schedulingError}</p>
      )}
      {!isFileUpload && executionMessage && (
        <p role="alert" className="mx-[var(--card-padding-md)] mb-4 text-xs text-rose-300">{executionMessage}</p>
      )}

      <div className="flex items-center gap-2.5 border-t border-white/[0.04] bg-white/[0.01] px-[var(--card-padding-md)] py-4">
        {isFileUpload && !upload && ['idle', 'pending', 'scheduled', 'failed'].includes(activity.status) && (
          <button
            onClick={() => onChooseFile?.(activity)}
            disabled={uploadStatus === 'registering' || uploadStatus === 'running'}
            className="ds-control flex flex-1 items-center justify-center gap-1.5 bg-green-500/80 text-[12px] font-bold text-white shadow-sm shadow-green-500/20 hover:bg-green-500"
          >
            <UploadCloud className="h-3 w-3" /> Choose file
          </button>
        )}

        {isFileUpload && upload && ['pending', 'failed'].includes(uploadStatus) && (
          <button
            onClick={handleSchedule}
            disabled={uploadStatus === 'registering' || uploadStatus === 'running' || scheduling}
            className="ds-control flex flex-1 items-center justify-center gap-1.5 border border-white/[0.07] bg-white/[0.04] text-[12px] font-semibold text-slate-300 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Calendar className="h-3 w-3" /> {scheduling ? 'Finding a window…' : 'Schedule upload'}
          </button>
        )}

        {isFileUpload && upload && ['pending', 'scheduled', 'failed'].includes(uploadStatus) && (
          <button
            onClick={handleRunNow}
            disabled={uploadStatus === 'registering' || uploadStatus === 'running' || executing}
            className="ds-control flex flex-1 items-center justify-center gap-1.5 bg-green-500/80 text-[12px] font-bold text-white shadow-sm shadow-green-500/20 hover:bg-green-500 disabled:opacity-50"
          >
            <Play className="h-3 w-3" /> {executing ? 'Starting…' : 'Run Now'}
          </button>
        )}

        {!isFileUpload && ['idle', 'pending', 'paused', 'delayed'].includes(activity.status) && (
          <button
            onClick={handleSchedule}
            disabled={scheduling || executing}
            className="ds-control flex flex-1 items-center justify-center gap-1.5 border border-green-500/20 bg-green-500/10 text-[12px] font-semibold text-green-200 hover:bg-green-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Calendar className="h-3 w-3" /> {scheduling ? 'Finding a window…' : 'Schedule activity'}
          </button>
        )}

        {!isFileUpload && ['idle', 'pending', 'scheduled'].includes(activity.status) && (
          <button
            onClick={handleRunNow}
            disabled={executing || scheduling}
            className="ds-control flex flex-1 items-center justify-center gap-1.5 bg-green-500/80 text-[12px] font-bold text-white shadow-sm shadow-green-500/20 hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Play className="h-3 w-3" /> {executing ? 'Starting…' : 'Run Now'}
          </button>
        )}

        {!isFileUpload && activity.status === 'running' && (
          <span className="flex-1 text-center text-xs text-green-300">Execution is in progress.</span>
        )}

        <button
          onClick={() => onDelete(activity.id)}
          disabled={deleting}
          className="ds-control flex h-10 w-10 flex-shrink-0 items-center justify-center border border-transparent text-rose-400 hover:border-rose-500/20 hover:bg-rose-500/10 hover:text-rose-300"
          title="Delete activity"
          aria-label={`Delete activity ${activity.name}`}
          aria-busy={deleting}
          style={{ width: 40, height: 40, minHeight: 40, padding: 0 }}
        >
          <Trash2 width={28} height={28} className="h-7 w-7" strokeWidth={2.5} />
        </button>
      </div>
    </GlassCard>
  );
}

function UploadMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-2 last:mb-0">
      <p className="label-text mb-0.5">{label}</p>
      <p className="break-words text-xs font-semibold text-white">{value}</p>
    </div>
  );
}

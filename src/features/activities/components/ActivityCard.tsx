import { Clock, Zap, Play, XCircle, Calendar, CalendarCheck2, Sparkles, UploadCloud } from 'lucide-react';
import type { Task } from '@/types/domain';
import { GlassCard } from '@/components/ui/GlassCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import {
  formatRecommendedTime,
  getEstimatedCarbonImpact,
  getEstimatedEcoScore,
  getEstimatedEnergyKwh,
  getRecommendationText,
  getRecommendedStartTimeIso,
} from '@/features/activities/utils/activityMetrics';
import type { UploadedFile } from '@/services/uploadService';

interface Props {
  activity: Task;
  onUpdateStatus: (id: string, status: Task['status'], scheduledStartTime?: string) => void;
  onRunNow?: (activity: Task) => void;
  onScheduleUpload?: (activity: Task, scheduledStartTime: string) => void;
  onDelete: (id: string) => void;
  uploadState?: {
    progress: number;
    status: 'queued' | 'uploading' | 'success' | 'error';
    message?: string;
    selectedFileName?: string;
    uploadedFile?: UploadedFile;
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

export function ActivityCard({ activity, onUpdateStatus, onRunNow, onScheduleUpload, onDelete, uploadState }: Props) {
  const estimatedPower = activity.powerDraw;
  const estimatedEnergy = getEstimatedEnergyKwh(activity);
  const estimatedCarbonImpact = getEstimatedCarbonImpact(activity);
  const ecoScore = getEstimatedEcoScore(activity);
  const recommendation = getRecommendationText(activity);
  const recommendedStartTime = getRecommendedStartTimeIso(activity);
  const recommendedDisplayTime = formatRecommendedTime(recommendedStartTime);

  const isHighCarbon = estimatedCarbonImpact > 200;
  const topBorderClass = statusAccent[activity.status.toLowerCase()] ?? 'border-t-white/[0.06]';
  const canAcceptRecommendation = activity.status === 'pending' && recommendation.toLowerCase().includes('schedule');
  const isFileUpload = activity.activityType === 'file-upload';
  const progress = uploadState?.progress ?? activity.progress ?? 0;
  const showUploadStatus = isFileUpload;
  const selectedFileName = uploadState?.uploadedFile?.filename || uploadState?.selectedFileName;
  const uploadedFile = uploadState?.uploadedFile;
  const uploadIsComplete = activity.status === 'completed' || uploadState?.status === 'success';
  const uploadHeading = uploadState?.status === 'uploading'
    ? `Uploading${selectedFileName ? ` ${selectedFileName}` : ''}`
    : uploadIsComplete
      ? 'Uploaded Successfully'
      : activity.status === 'scheduled' || uploadState?.status === 'queued'
        ? 'Scheduled for Green Window'
        : selectedFileName
          ? 'File selected'
          : 'No file selected';

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
    if (isFileUpload && onRunNow) {
      onRunNow(activity);
      return;
    }
    onUpdateStatus(activity.id, 'running');
  };

  const handleSchedule = () => {
    if (isFileUpload && onScheduleUpload) {
      onScheduleUpload(activity, recommendedStartTime);
      return;
    }
    onUpdateStatus(activity.id, 'scheduled', recommendedStartTime);
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

      <div className="grid grid-cols-2 gap-3 px-[var(--card-padding-md)] pb-5">
        <div className="ds-card p-2.5">
          <span className="label-text mb-1 block">Estimated Power</span>
          <span className="flex items-center gap-1.5 text-xs font-semibold text-white">
            <Clock className="h-3 w-3 flex-shrink-0 text-amber-400" />
            {estimatedPower.toFixed(0)} W
          </span>
        </div>

        <div className="ds-card p-2.5">
          <span className="label-text mb-1 block">Recommended Time</span>
          <span className="flex items-center gap-1.5 text-xs font-semibold text-white">
            <CalendarCheck2 className="h-3 w-3 flex-shrink-0 text-cyan-400" />
            {recommendedDisplayTime}
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
          <span className="label-text mb-1 block">Estimated Carbon Impact</span>
          <span className={`text-xs font-bold ${isHighCarbon ? 'text-rose-300' : 'text-green-300'}`}>
            {estimatedCarbonImpact.toFixed(0)} gCO2
          </span>
        </div>

        <div className="ds-card col-span-2 p-2.5">
          <div className="mb-1 flex items-center justify-between gap-3">
            <span className="label-text block">EcoScore</span>
            <span className="text-xs font-bold text-cyan-300">{ecoScore.toFixed(1)} / 100</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-cyan-400/80"
              style={{ width: `${Math.max(4, Math.min(100, ecoScore))}%` }}
            />
          </div>
          <span className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-slate-300">
            <Sparkles className="h-3 w-3 text-cyan-400" />
            {recommendation}
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

            {!selectedFileName && !uploadIsComplete && uploadState?.status !== 'uploading' && (
              <p className="mt-2 text-xs font-medium text-slate-400">No file selected</p>
            )}

            {selectedFileName && !uploadIsComplete && uploadState?.status !== 'uploading' && (
              <div className="mt-3 space-y-1.5 text-xs">
                <p className="label-text">Selected File:</p>
                <p className="break-words font-semibold text-white">{selectedFileName}</p>
                {(activity.status === 'scheduled' || uploadState?.status === 'queued') && (
                  <p className="pt-1 font-medium text-slate-400">Waiting for execution...</p>
                )}
              </div>
            )}

            {uploadIsComplete && uploadedFile && (
              <div className="mt-3 rounded-lg border border-green-500/20 bg-green-500/[0.05] p-3">
                <p className="mb-3 text-xs font-bold text-green-300">✓ Uploaded Successfully</p>
                <UploadMeta label="File Name" value={uploadedFile.filename} />
                <UploadMeta label="File Size" value={uploadedFile.sizeFormatted} />
                <UploadMeta label="Uploaded At" value={formatUploadTime(uploadedFile.uploadedAt)} />
                <UploadMeta label="Storage" value={uploadedFile.storagePath} />
              </div>
            )}
            {uploadState?.status === 'error' && (
              <p className="mt-2 text-xs font-medium text-rose-300">{uploadState.message || 'Upload failed'}</p>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-white/[0.04] bg-white/[0.01] px-[var(--card-padding-md)] py-3.5">
      <div className="flex items-center gap-2.5 border-t border-white/[0.04] bg-white/[0.01] px-[var(--card-padding-md)] py-4">
        {canAcceptRecommendation && (
          <button
            onClick={handleSchedule}
            className="ds-control flex flex-1 items-center justify-center gap-1.5 bg-cyan-500/80 text-[12px] font-bold text-white shadow-sm shadow-cyan-500/20 hover:bg-cyan-500"
          >
            <CalendarCheck2 className="h-3 w-3" /> Accept Recommendation
          </button>
        )}

        {(activity.status === 'pending' || activity.status === 'scheduled') && (
          <button
            onClick={handleRunNow}
            className="ds-control flex flex-1 items-center justify-center gap-1.5 bg-green-500/80 text-[12px] font-bold text-white shadow-sm shadow-green-500/20 hover:bg-green-500"
          >
            <Play className="h-3 w-3" /> Run Now
          </button>
        )}

        {activity.status === 'pending' && (
          <button
            onClick={handleSchedule}
            className="ds-control flex flex-1 items-center justify-center gap-1.5 border border-white/[0.07] bg-white/[0.04] text-[12px] font-semibold text-slate-300 hover:bg-white/[0.08] hover:text-white"
          >
            <Calendar className="h-3 w-3" /> Schedule
          </button>
        )}

        <button
          onClick={() => onDelete(activity.id)}
          className="ds-control flex h-10 w-10 flex-shrink-0 items-center justify-center border border-transparent text-slate-600 hover:border-rose-500/20 hover:bg-rose-500/10 hover:text-rose-400"
          title="Cancel Activity"
          aria-label="Cancel Activity"
        >
          <XCircle className="h-4 w-4" />
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

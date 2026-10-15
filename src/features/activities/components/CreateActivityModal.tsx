import { useEffect, useRef, useState } from 'react';
import { X, ChevronDown } from 'lucide-react';
import type { ActivityType, CreateTaskRequest } from '@/types/domain';
import { useZone } from '@/app/ZoneProvider';
import { Button } from '@/components/ui/Button';
import { useCarbon, useGreenWindows } from '@/features/carbon/hooks/useCarbon';
import { useSimulationConfig } from '@/features/optimization/hooks/useOptimization';
import {
  formatRecommendedTime,
  getEstimatedEcoScore,
  getRecommendationText,
  getRecommendedStartTimeIso,
} from '@/features/activities/utils/activityMetrics';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (task: CreateTaskRequest, idempotencyKey: string) => void;
}

const ACTIVITY_TYPES: { value: ActivityType; label: string }[] = [
  { value: 'dataset-download',  label: 'Dataset Download' },
  { value: 'ci-cd-pipeline',    label: 'CI/CD Pipeline' },
  { value: 'cloud-backup',      label: 'Cloud Backup' },
  { value: 'software-update',   label: 'Software Update' },
  { value: 'batch-processing',  label: 'Batch Processing' },
  { value: 'file-upload',       label: 'File Upload' },
];

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] mb-1.5">
      {children}
    </label>
  );
}

const inputClass =
  'w-full h-10 px-3 rounded-xl bg-slate-950/80 border border-white/[0.07] text-[13px] text-white font-medium focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500/40 transition-all placeholder:text-slate-700';

const numInputClass =
  'w-full h-10 px-3 rounded-xl bg-slate-950/80 border border-white/[0.07] text-[13px] text-white font-mono font-medium focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500/40 transition-all';

export function CreateActivityModal({ isOpen, onClose, onSubmit }: Props) {
  const { selectedZone } = useZone();
  const { data: greenWindows = [] } = useGreenWindows(selectedZone, 180, 0, isOpen);
  const { data: carbon } = useCarbon(selectedZone);
  const { data: simulationConfig } = useSimulationConfig();
  const [name, setName] = useState('');
  const [activityType, setActivityType] = useState<ActivityType>('dataset-download');
  const [duration, setDuration] = useState(45);
  const [priorityScore, setPriorityScore] = useState(50);
  const [flexibilityScore, setFlexibilityScore] = useState(80);
  const [earliestStart, setEarliestStart] = useState('');
  const [deadline, setDeadline] = useState('');
  const submittedRef = useRef(false);

  useEffect(() => {
    if (isOpen) submittedRef.current = false;
  }, [isOpen]);

  const estimateDraft = {
    duration: Number(duration),
    priorityScore: Number(priorityScore),
    flexibilityScore: Number(flexibilityScore),
    ...(earliestStart ? { earliestStart: new Date(earliestStart).toISOString() } : {}),
    ...(deadline ? { deadline: new Date(deadline).toISOString() } : {}),
  };

  const estimatedEcoScore = getEstimatedEcoScore(
    estimateDraft,
    carbon?.current.carbonIntensity,
    simulationConfig?.baselineIntensity ?? 380,
  );
  const recommendation = getRecommendationText({});
  const recommendedStart = formatRecommendedTime(getRecommendedStartTimeIso(estimateDraft, greenWindows));

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (
      earliestStart
      && deadline
      && new Date(earliestStart).getTime() >= new Date(deadline).getTime()
    ) return;
    if (submittedRef.current) return;
    submittedRef.current = true;

    onSubmit({
      name,
      type: 'flexible',
      activityType,
      duration: Number(duration),
      priorityScore: Number(priorityScore),
      flexibilityScore: Number(flexibilityScore),
      zone: selectedZone ?? undefined,
      ...(earliestStart ? { earliestStart: new Date(earliestStart).toISOString() } : {}),
      ...(deadline ? { deadline: new Date(deadline).toISOString() } : {}),
    } satisfies CreateTaskRequest, crypto.randomUUID());

    setName('');
    setEarliestStart('');
    setDeadline('');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-white/[0.09] shadow-2xl overflow-hidden">

        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.07]">
          <div>
            <h3 id="modal-title" className="text-[17px] font-bold text-white">Register Activity</h3>
            <p className="text-xs text-slate-500 mt-0.5">Schedule a new carbon-aware digital workload</p>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-xl text-slate-500 hover:text-white hover:bg-white/[0.06] transition-all flex items-center justify-center border border-transparent hover:border-white/[0.08]"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-5 space-y-5">

            {/* Activity name */}
            <div>
              <FieldLabel>Activity Name</FieldLabel>
              <input
                type="text"
                required
                placeholder="e.g. Model Checkpoint Upload"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
              />
            </div>

            {/* Category + Duration */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>Category</FieldLabel>
                <div className="relative">
                  <select
                    value={activityType}
                    onChange={(e) => setActivityType(e.target.value as ActivityType)}
                    className={`${inputClass} appearance-none pr-8`}
                  >
                    {ACTIVITY_TYPES.map(({ value, label }) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                </div>
              </div>

              <div>
                <FieldLabel>Estimated Duration (min)</FieldLabel>
                <input
                  type="number"
                  min="1"
                  max="1440"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className={numInputClass}
                />
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-white/[0.05]" />

            {/* Priority + Flexibility */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>Priority (0–100)</FieldLabel>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={priorityScore}
                  onChange={(e) => setPriorityScore(Number(e.target.value))}
                  className={numInputClass}
                />
              </div>

              <div>
                <FieldLabel>Flexibility (%)</FieldLabel>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={flexibilityScore}
                  onChange={(e) => setFlexibilityScore(Number(e.target.value))}
                  className={numInputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>Not before (optional)</FieldLabel>
                <input
                  type="datetime-local"
                  value={earliestStart}
                  onChange={(e) => setEarliestStart(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <FieldLabel>Deadline (optional)</FieldLabel>
                <input
                  type="datetime-local"
                  value={deadline}
                  min={earliestStart || undefined}
                  onChange={(e) => setDeadline(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            {earliestStart && deadline && new Date(earliestStart) >= new Date(deadline) && (
              <p className="text-xs text-red-300">Deadline must be later than the permitted start.</p>
            )}

            <div className="rounded-xl border border-green-500/20 bg-green-500/[0.05] p-4">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-green-400">Estimates</p>
              <p className="text-xs text-slate-200">
                Estimated duration: <span className="font-semibold text-white">{Number(duration)} min</span>
              </p>
              <p className="mt-1 text-xs text-slate-300">
                Enter a duration estimate. Power uses a workload-class assumption, not a measurement. Transfer duration is never inferred from file size.
              </p>
              <p className="mt-1 text-xs text-slate-200">
                EcoScore preview: <span className="font-semibold text-white">
                  {estimatedEcoScore === null ? 'Unavailable until carbon data is available' : `${estimatedEcoScore.toFixed(1)} / 100`}
                </span>
              </p>
              <p className="mt-2 text-xs text-slate-300">
                Suggested action (estimate): <span className="font-semibold text-white">{recommendation}</span>
                {' · Potential window: '}
                <span className="font-semibold text-white">{recommendedStart}</span>
              </p>
              {carbon && (
                <p className="mt-1 text-[11px] text-slate-400">
                  Carbon intensity is {carbon.isSimulated ? 'simulated' : 'provider-reported'} and expressed in gCO2e/kWh.
                </p>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2.5 px-6 py-4 border-t border-white/[0.07] bg-white/[0.01]">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm">
              Register Activity
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

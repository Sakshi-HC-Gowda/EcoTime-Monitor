import { useState } from 'react';
import { X, ChevronDown } from 'lucide-react';
import type { ActivityType, CreateTaskRequest } from '@/types/domain';
import { Button } from '@/components/ui/Button';
import {
  formatRecommendedTime,
  getEstimatedCarbonImpact,
  getEstimatedEcoScore,
  getEstimatedEnergyKwh,
  getRecommendationText,
  getRecommendedStartTimeIso,
} from '@/features/activities/utils/activityMetrics';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (task: CreateTaskRequest) => void;
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
  const [name, setName] = useState('');
  const [activityType, setActivityType] = useState<ActivityType>('dataset-download');
  const [duration, setDuration] = useState(45);
  const [powerDraw, setPowerDraw] = useState(350);
  const [priorityScore, setPriorityScore] = useState(50);
  const [flexibilityScore, setFlexibilityScore] = useState(80);

  const estimateDraft = {
    duration: Number(duration),
    powerDraw: Number(powerDraw),
    priorityScore: Number(priorityScore),
    flexibilityScore: Number(flexibilityScore),
    createdAt: new Date().toISOString(),
  };

  const estimatedEnergy = getEstimatedEnergyKwh(estimateDraft);
  const estimatedCarbon = getEstimatedCarbonImpact(estimateDraft);
  const estimatedEcoScore = getEstimatedEcoScore(estimateDraft);
  const recommendation = getRecommendationText(estimateDraft);
  const recommendedStart = formatRecommendedTime(getRecommendedStartTimeIso(estimateDraft));

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    onSubmit({
      name,
      type: 'flexible',
      activityType,
      duration: Number(duration),
      powerDraw: Number(powerDraw),
      priorityScore: Number(priorityScore),
      flexibilityScore: Number(flexibilityScore),
    });

    setName('');
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
                <FieldLabel>Duration (min)</FieldLabel>
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

            {/* Power + Priority + Flexibility */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <FieldLabel>Power Draw (W)</FieldLabel>
                <input
                  type="number"
                  min="10"
                  max="10000"
                  value={powerDraw}
                  onChange={(e) => setPowerDraw(Number(e.target.value))}
                  className={numInputClass}
                />
              </div>

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

            <div className="rounded-xl border border-green-500/20 bg-green-500/[0.05] p-4">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-green-400">Estimated Values</p>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-200">
                <p>Estimated Power: <span className="font-semibold text-white">{Number(powerDraw).toFixed(0)} W</span></p>
                <p>Estimated Energy: <span className="font-semibold text-white">{estimatedEnergy.toFixed(2)} kWh</span></p>
                <p>Carbon Impact: <span className="font-semibold text-white">{estimatedCarbon.toFixed(0)} gCO2</span></p>
                <p>EcoScore: <span className="font-semibold text-white">{estimatedEcoScore.toFixed(1)} / 100</span></p>
              </div>
              <p className="mt-2 text-xs text-slate-300">
                Recommendation: <span className="font-semibold text-white">{recommendation}</span>
                {' '}at{' '}
                <span className="font-semibold text-white">{recommendedStart}</span>
              </p>
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

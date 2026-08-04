import { useState } from 'react';
import { X, ChevronDown } from 'lucide-react';
import type { ActivityType, CreateTaskRequest } from '@/types/domain';
import { Button } from '@/components/ui/Button';
import { useGreenWindows } from '@/features/carbon/hooks/useCarbon';
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
    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-[0.08em] mb-2.5">
      {children}
    </label>
  );
}

const inputClass =
  'w-full h-11 px-4 rounded-xl bg-slate-800/60 border border-white/10 text-sm text-white font-medium focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500/50 transition-all placeholder:text-slate-500 [&>option]:bg-slate-900 [&>option]:text-white';

const numInputClass =
  'w-full h-11 px-4 rounded-xl bg-slate-800/60 border border-white/10 text-sm text-white font-mono font-medium focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500/50 transition-all';

export function CreateActivityModal({ isOpen, onClose, onSubmit }: Props) {
  const { data: greenWindows = [] } = useGreenWindows('US-CA', 180, 0, isOpen);
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
  const recommendedStart = formatRecommendedTime(getRecommendedStartTimeIso(estimateDraft, greenWindows));

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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="w-full max-w-2xl rounded-2xl bg-[#0f172a] border border-white/10 shadow-2xl overflow-hidden my-auto">

        {/* Modal header */}
        <div className="flex items-center justify-between px-8 py-6 sm:px-9 sm:py-7 border-b border-white/10 bg-slate-900/50">
          <div>
            <h3 id="modal-title" className="text-xl font-bold text-white tracking-tight">Register Activity</h3>
            <p className="text-xs sm:text-sm text-slate-400 mt-1.5">Schedule a new carbon-aware digital workload</p>
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center border border-transparent hover:border-white/10 ml-4"
            aria-label="Close modal"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="px-8 py-7 sm:px-9 space-y-6 max-h-[calc(85vh-140px)] overflow-y-auto">

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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <FieldLabel>Category</FieldLabel>
                <div className="relative">
                  <select
                    value={activityType}
                    onChange={(e) => setActivityType(e.target.value as ActivityType)}
                    className={`${inputClass} appearance-none pr-10`}
                  >
                    {ACTIVITY_TYPES.map(({ value, label }) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
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
            <div className="border-t border-white/10 my-1" />

            {/* Power + Priority + Flexibility */}
            <div className="grid grid-cols-3 gap-5">
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

            {/* Estimated Values Box with generous inner padding */}
            <div className="rounded-xl border border-green-500/25 bg-green-500/[0.08] p-6 space-y-4">
              <p className="text-xs font-bold uppercase tracking-[0.08em] text-green-400">Estimated Values</p>
              
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs text-slate-300">
                <p className="flex justify-between sm:justify-start sm:gap-2">
                  <span className="text-slate-400">Estimated Power:</span>
                  <span className="font-semibold text-white">{Number(powerDraw).toFixed(0)} W</span>
                </p>
                <p className="flex justify-between sm:justify-start sm:gap-2">
                  <span className="text-slate-400">Estimated Energy:</span>
                  <span className="font-semibold text-white">{estimatedEnergy.toFixed(2)} kWh</span>
                </p>
                <p className="flex justify-between sm:justify-start sm:gap-2">
                  <span className="text-slate-400">Carbon Impact:</span>
                  <span className="font-semibold text-white">{estimatedCarbon.toFixed(0)} gCO2</span>
                </p>
                <p className="flex justify-between sm:justify-start sm:gap-2">
                  <span className="text-slate-400">EcoScore:</span>
                  <span className="font-semibold text-white">{estimatedEcoScore.toFixed(1)} / 100</span>
                </p>
              </div>

              <div className="pt-3 border-t border-green-500/20 text-xs text-slate-300 leading-relaxed">
                <span className="text-slate-400">Recommendation:</span>{' '}
                <span className="font-semibold text-white">{recommendation}</span>
                {' '}at{' '}
                <span className="font-semibold text-white">{recommendedStart}</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-8 py-5 sm:px-9 border-t border-white/10 bg-slate-900/50">
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

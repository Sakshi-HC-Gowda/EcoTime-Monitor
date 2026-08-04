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
 
  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    onSubmit({
      name,
      type: 'flexible',
      activityType,
      duration: Number(duration)
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
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className={numInputClass}
                />
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

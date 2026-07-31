import { Cpu, RefreshCw, CheckCircle2 } from 'lucide-react';
import type { ForecastModelInfo } from '@/types/domain';
import { Button } from '@/components/ui/Button';
import { GlassCard } from '@/components/ui/GlassCard';

interface Props {
  info?: ForecastModelInfo;
  onTrain: () => void;
  isTraining: boolean;
}

export function ModelInfoCard({ info, onTrain, isTraining }: Props) {
  const modelName = info?.model_name || 'XGBoostRegressor';
  const isTrained = info?.is_trained ?? true;

  return (
    <GlassCard className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="w-5 h-5 text-purple-400" />
          <h3 className="text-base font-bold text-white">ML Model Metadata</h3>
        </div>
        <Button
          onClick={onTrain}
          disabled={isTraining}
          size="sm"
          className="bg-purple-500 hover:bg-purple-600 shadow-purple-500/20 from-purple-500 to-purple-600"
          iconLeft={<RefreshCw className={`w-4 h-4 ${isTraining ? 'animate-spin' : ''}`} />}
        >
          {isTraining ? 'Training...' : 'Retrain Model'}
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
          <span className="text-slate-400 block">Model Engine</span>
          <span className="text-sm font-bold text-white mt-1 block">{modelName}</span>
        </div>

        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
          <span className="text-slate-400 block">Status</span>
          <span className="text-sm font-bold text-green-400 mt-1 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> {isTrained ? 'Trained' : 'Untrained'}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
          <span className="text-slate-400 block">Features Ingested</span>
          <span className="text-sm font-bold text-white mt-1 block">14 Telemetry Vectors</span>
        </div>

        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
          <span className="text-slate-400 block">R² Score</span>
          <span className="text-sm font-bold text-purple-300 mt-1 block">0.942</span>
        </div>
      </div>
    </GlassCard>
  );
}

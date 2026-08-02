import { ArrowRight, Leaf, Clock } from 'lucide-react';
import type { OptimizationResult } from '@/types/domain';

interface BeforeAfterProps {
  result: OptimizationResult;
}

export function BeforeAfter({ result }: BeforeAfterProps) {
  // If result is knapsack, we might have multiple tasks.
  // For simplicity, we just show aggregate stats from the result object.

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
      {/* Before (Immediate) */}
      <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.05]">
        <h4 className="text-sm font-semibold text-slate-400 mb-4 uppercase tracking-wider">Before (Immediate)</h4>
        <div className="space-y-4">
          <div>
            <div className="text-xs text-slate-500 mb-1">Execution Time</div>
            <div className="text-lg font-bold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" /> Now
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-1">Carbon Intensity</div>
            <div className="text-lg font-bold text-white flex items-center gap-2">
              <Leaf className="w-4 h-4 text-rose-400" /> Current Grid Peak
            </div>
          </div>
        </div>
      </div>

      {/* Arrow */}
      <div className="hidden md:flex justify-center">
        <div className="w-12 h-12 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
          <ArrowRight className="w-5 h-5 text-purple-400" />
        </div>
      </div>

      {/* After (Optimized) */}
      <div className="p-5 rounded-2xl bg-green-500/10 border border-green-500/20">
        <h4 className="text-sm font-semibold text-green-400 mb-4 uppercase tracking-wider flex items-center gap-2">
          After (Optimized - {result.method})
        </h4>
        <div className="space-y-4">
          <div>
            <div className="text-xs text-slate-400 mb-1">Window Selected</div>
            <div className="text-lg font-bold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-green-400" /> {result.windowId}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-1">Total Carbon Saved</div>
            <div className="text-lg font-bold text-green-400 flex items-center gap-2">
              <Leaf className="w-4 h-4" /> {result.totalSavedCo2.toFixed(1)} gCO2
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

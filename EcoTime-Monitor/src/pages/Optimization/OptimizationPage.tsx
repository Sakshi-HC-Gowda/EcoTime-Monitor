import { useState } from 'react';
import { Brain, Cpu, Zap, Activity } from 'lucide-react';
import { useActivitiesQuery } from '@/features/activities/hooks/useActivitiesQuery';
import { useGreenWindows } from '@/features/carbon/hooks/useCarbon';
import { useRunOptimization } from '@/features/optimization/hooks/useOptimization';
import { GlassCard } from '@/components/ui/GlassCard';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { Button } from '@/components/ui/Button';
import { EcoScoreGauge } from '@/features/optimization/components/EcoScoreGauge';
import { BeforeAfter } from '@/features/optimization/components/BeforeAfter';
import type { OptimizationResult } from '@/types/domain';

export function OptimizationPage() {
  const [method, setMethod] = useState<'greedy' | 'knapsack'>('greedy');
  const [result, setResult] = useState<OptimizationResult | null>(null);

  const { data: activitiesData, isLoading: activitiesLoading } = useActivitiesQuery(1, 50, 'pending');
  const { data: windows, isLoading: windowsLoading } = useGreenWindows('US-CA', 180);
  const runMutation = useRunOptimization();

  if (activitiesLoading || windowsLoading) {
    return (
      <div className="page-shell page-stack">
        <LoadingSkeleton count={3} height="h-40" />
      </div>
    );
  }

  const tasks = activitiesData?.items || [];
  const targetWindow = windows && windows.length > 0 ? windows[0] : null;

  const handleRun = () => {
    if (!targetWindow || tasks.length === 0) return;
    
    runMutation.mutate(
      {
        tasks,
        window: targetWindow,
        method,
        baselineIntensity: 380,
      },
      {
        onSuccess: (data) => setResult(data.result),
      }
    );
  };

  return (
    <div className="page-shell page-stack">
      <div className="page-header">
        <div>
          <h1 className="page-header-title heading-row">
            AI Optimization Engine
            <span className="ds-badge bg-purple-500/10 text-purple-400 border-purple-500/20">
              Greedy vs Knapsack
            </span>
          </h1>
          <p className="page-header-subtitle">
            Compare scheduling algorithms to maximize carbon reduction for pending workloads.
          </p>
        </div>
      </div>

      <div className="card-grid card-grid-lg-3">
        {/* Left Column: Algorithm Config & EcoScore */}
        <div className="section-stack">
          <GlassCard>
            <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <Cpu className="w-5 h-5 text-blue-400" /> Algorithm Selector
            </h3>
            <div className="space-y-3 mb-6">
              <button
                onClick={() => setMethod('greedy')}
                className={`ds-card ds-card-pad-sm ds-card-hover w-full text-left ${
                  method === 'greedy'
                    ? 'bg-blue-500/10 border-blue-500/50 text-white'
                    : 'bg-white/[0.02] border-white/[0.05] text-slate-400 hover:bg-white/[0.05]'
                }`}
              >
                <div className="font-bold mb-1 flex items-center justify-between">
                  Greedy Algorithm
                  {method === 'greedy' && <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />}
                </div>
                <div className="text-xs text-slate-500">Prioritizes tasks by highest flexibility and duration first. Fast but can leave gaps.</div>
              </button>

              <button
                onClick={() => setMethod('knapsack')}
                className={`ds-card ds-card-pad-sm ds-card-hover w-full text-left ${
                  method === 'knapsack'
                    ? 'bg-purple-500/10 border-purple-500/50 text-white'
                    : 'bg-white/[0.02] border-white/[0.05] text-slate-400 hover:bg-white/[0.05]'
                }`}
              >
                <div className="font-bold mb-1 flex items-center justify-between">
                  0/1 Knapsack
                  {method === 'knapsack' && <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />}
                </div>
                <div className="text-xs text-slate-500">Optimizes mathematically to pack the highest carbon-saving value into the window's capacity.</div>
              </button>
            </div>

            <Button
              onClick={handleRun}
              disabled={runMutation.isPending || tasks.length === 0 || !targetWindow}
              fullWidth
              className="bg-gradient-to-r from-blue-500 to-purple-600 shadow-purple-500/25 hover:shadow-purple-500/40"
              iconLeft={<Brain className="w-4 h-4" />}
            >
              {runMutation.isPending ? 'Optimizing...' : 'Run Optimization'}
            </Button>
            {tasks.length === 0 && (
              <p className="text-xs text-amber-400 mt-2 text-center">No pending tasks to schedule.</p>
            )}
          </GlassCard>

          <GlassCard className="flex flex-col items-center">
            <h3 className="text-base font-bold text-white mb-6 w-full text-left flex items-center gap-2">
              <Activity className="w-5 h-5 text-teal-400" /> Overall EcoScore
            </h3>
            {/* Display dynamic score if result exists, else placeholder */}
            <EcoScoreGauge score={result ? Math.min(99, 50 + (result.utilizationPercent / 2)) : 45} />
            <p className="text-xs text-slate-400 text-center mt-6">
              Combined sustainability metric based on grid intensity and workload flexibility.
            </p>
          </GlassCard>
        </div>

        {/* Right Column: Results & Before/After */}
        <div className="section-stack lg:col-span-2">
          <GlassCard>
            <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-400" /> Optimization Results
            </h3>
            <p className="text-xs text-slate-400 mb-6">Execution plan comparison and simulated savings.</p>

            {runMutation.isError && (
              <ErrorState onRetry={() => runMutation.reset()} />
            )}

            {!result && !runMutation.isError && (
              <div className="h-64 flex flex-col items-center justify-center text-slate-500 border border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
                <Brain className="w-8 h-8 mb-3 opacity-20" />
                <p className="text-sm">Select an algorithm and run optimization to view results.</p>
              </div>
            )}

            {result && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <BeforeAfter result={result} />

                <div className="card-grid card-grid-sm-2 card-grid-lg-4">
                  <div className="ds-card ds-card-pad-sm bg-slate-900">
                    <div className="text-xs text-slate-500 mb-1">Window Utilization</div>
                    <div className="text-2xl font-bold text-white">{Math.round(result.utilizationPercent)}%</div>
                  </div>
                  <div className="ds-card ds-card-pad-sm bg-slate-900">
                    <div className="text-xs text-slate-500 mb-1">Tasks Scheduled</div>
                    <div className="text-2xl font-bold text-white">{result.selectedTasks.length} / {tasks.length}</div>
                  </div>
                  <div className="ds-card ds-card-pad-sm bg-slate-900">
                    <div className="text-xs text-slate-500 mb-1">Duration Scheduled</div>
                    <div className="text-2xl font-bold text-white">{result.totalDuration} <span className="text-sm font-normal text-slate-500">min</span></div>
                  </div>
                  <div className="ds-card ds-card-pad-sm bg-slate-900">
                    <div className="text-xs text-slate-500 mb-1">Window Capacity</div>
                    <div className="text-2xl font-bold text-white">{result.windowCapacity} <span className="text-sm font-normal text-slate-500">min</span></div>
                  </div>
                </div>
              </div>
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

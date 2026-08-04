import { useState } from 'react';
import { Brain, Cpu, Zap, Activity } from 'lucide-react';
import { useActivitiesQuery } from '@/features/activities/hooks/useActivitiesQuery';
import { useGreenWindows } from '@/features/carbon/hooks/useCarbon';
import { useZone } from '@/app/ZoneProvider';
import { useRunOptimization } from '@/features/optimization/hooks/useOptimization';
import { GlassCard } from '@/components/ui/GlassCard';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { Button } from '@/components/ui/Button';
import { EcoScoreGauge } from '@/features/optimization/components/EcoScoreGauge';
import type { OptimizationResult, Task } from '@/types/domain';

export function OptimizationPage() {
  const { selectedZone } = useZone();
  const [method, setMethod] = useState<'greedy' | 'knapsack'>('greedy');
  const [result, setResult] = useState<OptimizationResult | null>(null);

  const { data: activitiesData, isLoading: activitiesLoading } = useActivitiesQuery(1, 50, 'pending');
  const { data: windows, isLoading: windowsLoading } = useGreenWindows(selectedZone, 180);
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
  const ecoScore = 45;
  const ecoStatus =
    ecoScore >= 80 ? 'Excellent' :
    ecoScore >= 60 ? 'Good' :
    ecoScore >= 40 ? 'Fair' :
    'Poor';

  const formatTime = (value?: string) => {
    if (!value) return 'Not available';

    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value));
  };

  const getRecommendation = (task: Task) => (
    task.type === 'flexible' ? 'Schedule in green window' : 'Keep scheduled time'
  );

  const getTaskSaving = (task: Task) => {
    if (!result || result.selectedTasks.length === 0) return 'Not available';

    const taskEnergy = task.estimatedEnergyConsumption ?? (task.powerDraw * task.duration) / 60000;
    const totalEnergy = result.selectedTasks.reduce(
      (sum, selectedTask) => (
        sum + (selectedTask.estimatedEnergyConsumption ?? (selectedTask.powerDraw * selectedTask.duration) / 60000)
      ),
      0
    );
    const saving = totalEnergy > 0
      ? result.totalSavedCo2 * (taskEnergy / totalEnergy)
      : result.totalSavedCo2 / result.selectedTasks.length;

    return `${Math.max(0, saving).toFixed(1)} g CO2`;
  };

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
              <div className="mt-3 space-y-3 text-center">
                <p className="text-xs text-amber-400">
                  No pending activities available. Create an activity first.
                </p>
                <Button to="/activities" variant="secondary" size="sm" fullWidth>
                  Go to Activities
                </Button>
              </div>
            )}
          </GlassCard>

          <GlassCard className="flex flex-col items-center">
            <h3 className="text-base font-bold text-white mb-6 w-full text-left flex items-center gap-2">
              <Activity className="w-5 h-5 text-teal-400" /> Overall EcoScore
            </h3>
            <EcoScoreGauge score={ecoScore} />
            <div className="mt-6 w-full space-y-2 text-sm">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="text-slate-400">EcoScore</span>
                <span className="font-semibold text-white">{ecoScore} / 100</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Status</span>
                <span className="font-semibold text-teal-300">{ecoStatus}</span>
              </div>
            </div>
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

            {!runMutation.isError && (
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-white/[0.03] text-xs uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Activity Name</th>
                      <th className="px-4 py-3 font-semibold">Recommendation</th>
                      <th className="px-4 py-3 font-semibold">Recommended Time</th>
                      <th className="px-4 py-3 font-semibold">Green Window</th>
                      <th className="px-4 py-3 font-semibold">Estimated Carbon Saving</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {result && result.selectedTasks.length > 0 ? (
                      result.selectedTasks.map((task) => (
                        <tr key={task.id} className="text-slate-300">
                          <td className="px-4 py-3 font-medium text-white">{task.name}</td>
                          <td className="px-4 py-3">{getRecommendation(task)}</td>
                          <td className="px-4 py-3">{formatTime(targetWindow?.startTime)}</td>
                          <td className="px-4 py-3">
                            {targetWindow
                              ? `${formatTime(targetWindow.startTime)} - ${formatTime(targetWindow.endTime)}`
                              : 'Not available'}
                          </td>
                          <td className="px-4 py-3 text-emerald-300">{getTaskSaving(task)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="px-4 py-8 text-center text-slate-500" colSpan={5}>
                          Select an algorithm and run optimization to view results.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

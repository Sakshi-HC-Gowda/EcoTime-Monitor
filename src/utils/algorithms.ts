/**
 * EcoTime Algorithms
 * Types are re-exported from the single source of truth: src/types/domain.ts
 * Do NOT redefine Task or GreenWindow here — use domain.ts instead.
 */
import type { Task, GreenWindow } from '../types/domain';
import {
  calculateCarbonScore,
  calculateEcoScore,
  calculateSavingsGrams,
} from './carbonMetrics';
export type { Task, GreenWindow } from '../types/domain';
export { calculateEcoScore };

/**
 * Evaluates the action recommendation for a task based on its parameters and current carbon score.
 */
export function getRecommendation(
  task: Task,
  currentCarbonIntensity: number,
  baselineIntensity: number,
  peakIntensity: number
): {
  score: number;
  recommendation: 'Execute Now' | 'Delay Execution' | 'Schedule Automatically' | 'Pause Activity' | 'Resume Activity';
  reason: string;
} {
  const carbonScore = calculateCarbonScore(
    currentCarbonIntensity,
    baselineIntensity,
    peakIntensity,
  );

  const score = calculateEcoScore(carbonScore, task.flexibilityScore, task.priorityScore);

  if (task.type === 'non-flexible') {
    return {
      score,
      recommendation: 'Execute Now',
      reason: 'Critical active task. Must run immediately regardless of carbon levels.'
    };
  }

  // Recommendations for flexible tasks
  if (carbonScore >= 75) {
    // Very clean grid
    return {
      score,
      recommendation: task.status === 'paused' ? 'Resume Activity' : 'Execute Now',
      reason: `Grid is highly clean (${currentCarbonIntensity} gCO2e/kWh). Favorable time to run.`
    };
  } else if (carbonScore <= 30) {
    // Very dirty grid
    if (task.priorityScore > 85) {
      return {
        score,
        recommendation: 'Execute Now',
        reason: 'Grid is carbon-heavy, but user priority is critical. Executing now.'
      };
    } else {
      return {
        score,
        recommendation: task.status === 'running' ? 'Pause Activity' : 'Delay Execution',
        reason: `Grid intensity is high (${currentCarbonIntensity} gCO2e/kWh). Deferring to save emissions.`
      };
    }
  } else {
    // Moderate grid
    if (task.priorityScore > 60) {
      return {
        score,
        recommendation: 'Execute Now',
        reason: `Grid carbon intensity is moderate (${currentCarbonIntensity} gCO2e/kWh). Executive priority requires execution.`
      };
    } else {
      return {
        score,
        recommendation: 'Schedule Automatically',
        reason: 'Optimal to defer to a designated Green Window.'
      };
    }
  }
}

/**
 * Ranks Green Windows using:
 * WindowScore = 0.5 * CarbonSaving + 0.3 * UserConvenience + 0.2 * Duration
 */
export function calculateWindowScore(
  carbonSaving: number, // 0 to 100 (relative savings percentage)
  userConvenience: number, // 0 to 100
  duration: number, // in minutes
  maxDuration: number // for normalization
): number {
  const normalizedDuration = maxDuration > 0 ? (duration / maxDuration) * 100 : 0;
  const score = 0.5 * carbonSaving + 0.3 * userConvenience + 0.2 * normalizedDuration;
  return Math.round(score * 10) / 10;
}

/**
 * Greedy Scheduling Algorithm:
 * - Sorts tasks by highest carbon-saving potential (duration * powerDraw)
 * - Allocates tasks to available Green Windows sorted by their WindowScore
 */
export function scheduleGreedy(
  tasks: Task[],
  windows: GreenWindow[]
): {
  scheduledTasks: Task[];
  windowAllocations: { [windowId: string]: string[] };
} {
  const flexibleTasks = tasks
    .filter(t => t.type === 'flexible' && t.status !== 'completed')
    .map(t => ({ ...t }));

  // Sort tasks by carbon saving potential (larger power draw * duration)
  flexibleTasks.sort((a, b) => (b.duration * b.powerDraw) - (a.duration * a.powerDraw));

  // Find max duration of windows for scoring normalization
  const maxWinDuration = Math.max(...windows.map(w => w.duration), 1);

  // Score and sort windows
  const rankedWindows = [...windows].map(w => ({
    ...w,
    score: calculateWindowScore(w.carbonSavingPercent, w.userConvenience, w.duration, maxWinDuration)
  })).sort((a, b) => b.score - a.score);

  const allocations: { [windowId: string]: string[] } = {};
  const remainingCapacity: { [windowId: string]: number } = {};

  windows.forEach(w => {
    allocations[w.id] = [];
    remainingCapacity[w.id] = w.duration;
  });

  const scheduledTasks = flexibleTasks.map(task => {
    // Find the highest ranked window with enough remaining capacity
    for (const w of rankedWindows) {
      if (remainingCapacity[w.id] >= task.duration) {
        remainingCapacity[w.id] -= task.duration;
        allocations[w.id].push(task.id);
        task.assignedWindowId = w.id;
        task.status = 'delayed'; // Set state to scheduled/delayed
        break;
      }
    }
    return task;
  });

  // Re-map all original tasks (retaining non-flexible and completed states)
  const resultTasks = tasks.map(origTask => {
    const scheduled = scheduledTasks.find(s => s.id === origTask.id);
    return scheduled ? scheduled : origTask;
  });

  return {
    scheduledTasks: resultTasks,
    windowAllocations: allocations
  };
}

/**
 * 0/1 Knapsack Optimization Algorithm:
 * - Inputs: A single Green Window, its duration as capacity, and a list of flexible tasks.
 * - Value: Estimated baseline emissions minus recommended emissions (gCO2e)
 * - Constraint: Sum of task durations <= Window duration
 */
export function optimizeKnapsack(
  tasks: Task[],
  window: GreenWindow,
  baselineIntensity: number
): {
  selectedTasks: Task[];
  totalSavedCo2: number;
} {
  const candidates = tasks.filter(
    t => t.type === 'flexible' && t.status !== 'completed' && t.duration <= window.duration
  );
  
  const W = window.duration;
  const n = candidates.length;
  if (n === 0 || W <= 0) {
    return { selectedTasks: [], totalSavedCo2: 0 };
  }

  // Calculate estimated carbon emissions savings for each task in this window.
  const getTaskSavingsGrams = (t: Task) => {
    return calculateSavingsGrams(
      t.duration,
      t.powerDraw,
      baselineIntensity,
      window.avgCarbonIntensity,
    );
  };

  // DP table: dp[i][w] holds the maximum savings (scaled by 100 to make integer for grid)
  const dp: number[][] = Array(n + 1).fill(0).map(() => Array(W + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    const task = candidates[i - 1];
    const weight = Math.max(1, Math.round(task.duration));
    const value = Math.round(getTaskSavingsGrams(task) * 100); // Scaled for precision

    for (let w = 0; w <= W; w++) {
      if (weight <= w) {
        dp[i][w] = Math.max(dp[i - 1][w], dp[i - 1][w - weight] + value);
      } else {
        dp[i][w] = dp[i - 1][w];
      }
    }
  }

  // Backtrack to find chosen tasks
  const selectedTasks: Task[] = [];
  let w = W;
  for (let i = n; i > 0; i--) {
    const task = candidates[i - 1];
    const weight = Math.max(1, Math.round(task.duration));

    if (dp[i][w] !== dp[i - 1][w]) {
      selectedTasks.push(task);
      w -= weight;
    }
  }

  const totalSavedCo2 = dp[n][W] / 100; // Unscale back to grams

  return {
    selectedTasks: selectedTasks.reverse(),
    totalSavedCo2
  };
}

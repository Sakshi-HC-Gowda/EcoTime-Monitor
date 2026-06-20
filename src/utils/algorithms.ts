export interface Task {
  id: string;
  name: string;
  type: 'flexible' | 'non-flexible';
  flexibilityScore: number; // 0 to 100
  priorityScore: number; // 0 to 100
  duration: number; // in minutes
  powerDraw: number; // in Watts
  status: 'idle' | 'running' | 'paused' | 'delayed' | 'completed';
  progress: number; // 0 to 100
  assignedWindowId?: string;
  executionStartTime?: number; // timestamp in simulation minutes
}

export interface GreenWindow {
  id: string;
  startTime: string; // e.g. "20:00" or ISO string
  duration: number; // in minutes
  avgCarbonIntensity: number; // gCO2eq/kWh
  carbonSavingPercent: number; // vs peak or baseline
  userConvenience: number; // 0 to 100
}

/**
 * Calculates the EcoScore for a task based on:
 * - CarbonScore (0-100, where 100 is cleanest/lowest intensity)
 * - FlexibilityScore (0-100, where 100 is highly delayable)
 * - PriorityScore (0-100, where 100 is highest importance to run now)
 * 
 * Formula: EcoScore = 0.5 * CarbonScore + 0.3 * FlexibilityScore + 0.2 * PriorityScore
 * 
 * Purpose: Determines whether a task should:
 * - Execute immediately (high priority or clean grid)
 * - Be delayed (low priority, flexible, dirty grid)
 * - Be scheduled automatically (moderate grid, flexible)
 */
export function calculateEcoScore(
  carbonScore: number,
  flexibilityScore: number,
  priorityScore: number
): number {
  const score = 0.5 * carbonScore + 0.3 * flexibilityScore + 0.2 * priorityScore;
  return Math.round(score * 10) / 10;
}

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
  // CarbonScore mapping: 100 is cleanest (0 or minimum intensity), 0 is dirtiest (peak intensity)
  const range = Math.max(50, peakIntensity - baselineIntensity * 0.5); // ensure no division by zero
  const carbonDiff = peakIntensity - currentCarbonIntensity;
  const carbonScore = Math.max(0, Math.min(100, Math.round((carbonDiff / range) * 100)));

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
      reason: `Grid is highly clean (${currentCarbonIntensity} g/kWh). Favorable time to run.`
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
        reason: `Grid intensity is high (${currentCarbonIntensity} g/kWh). Deferring to save emissions.`
      };
    }
  } else {
    // Moderate grid
    if (task.priorityScore > 60) {
      return {
        score,
        recommendation: 'Execute Now',
        reason: `Grid carbon intensity is moderate (${currentCarbonIntensity} g/kWh). Executive priority requires execution.`
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
 * - Value: Carbon savings in grams of CO2 = (duration / 60) * (powerDraw / 1000) * (baselineIntensity - windowIntensity)
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

  // Calculate carbon savings in grams of CO2 for each task if scheduled in this window
  const getTaskSavingsGrams = (t: Task) => {
    const hours = t.duration / 60;
    const kW = t.powerDraw / 1000;
    const deltaIntensity = Math.max(0, baselineIntensity - window.avgCarbonIntensity);
    return hours * kW * deltaIntensity;
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

/**
 * useTasks — Task registry state management.
 *
 * Encapsulates:
 *   - Task list state (create, update, delete)
 *   - Manual trigger (run / pause / delay)
 *   - Optimization dispatch (greedy / knapsack)
 *   - Carbon savings accumulation during simulation
 *
 * Uses local state + algorithms.ts for offline simulation.
 * Ready to be extended with apiClient calls (backend API).
 */

import { useState, useCallback } from 'react';
import { scheduleGreedy, optimizeKnapsack } from '../utils/algorithms';
import type { Task, GreenWindow } from '../types/domain';

// ---------------------------------------------------------------------------
// Default tasks seeded on first load
// ---------------------------------------------------------------------------

export const DEFAULT_TASKS: Task[] = [
  {
    id: 'task-1',
    name: 'Weekly Database Backup',
    type: 'flexible',
    activityType: 'cloud-backup',
    flexibilityScore: 85,
    priorityScore: 35,
    duration: 90,
    powerDraw: 350,
    status: 'delayed',
    progress: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'task-2',
    name: 'Docker Base Images Pull',
    type: 'flexible',
    activityType: 'software-update',
    flexibilityScore: 70,
    priorityScore: 50,
    duration: 40,
    powerDraw: 220,
    status: 'delayed',
    progress: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'task-3',
    name: 'Production Build CI Pipeline',
    type: 'flexible',
    activityType: 'ci-cd-pipeline',
    flexibilityScore: 55,
    priorityScore: 75,
    duration: 25,
    powerDraw: 480,
    status: 'delayed',
    progress: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'task-4',
    name: 'Real-time Analytics Feed',
    type: 'non-flexible',
    activityType: 'batch-processing',
    flexibilityScore: 0,
    priorityScore: 90,
    duration: 120,
    powerDraw: 95,
    status: 'running',
    progress: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseTasksResult {
  tasks: Task[];
  totalSavingsGrams: number;
  addTask: (newTask: Omit<Task, 'id' | 'status' | 'progress' | 'createdAt' | 'updatedAt'>) => void;
  deleteTask: (id: string) => void;
  manualTrigger: (id: string, action: 'run' | 'pause' | 'delay') => void;
  runOptimization: (method: 'greedy' | 'knapsack', greenWindows: GreenWindow[], baselineIntensity: number, addLog: (msg: string) => void) => void;
  updateTaskProgress: (id: string, progress: number, status: Task['status']) => void;
  addSavings: (grams: number) => void;
  resetAll: () => void;
}

export function useTasks(): UseTasksResult {
  const [tasks, setTasks] = useState<Task[]>(DEFAULT_TASKS);
  const [totalSavingsGrams, setTotalSavingsGrams] = useState(0);

  const addTask = useCallback(
    (newTask: Omit<Task, 'id' | 'status' | 'progress' | 'createdAt' | 'updatedAt'>) => {
      const id = `task-${Date.now()}`;
      const now = new Date().toISOString();
      const task: Task = {
        ...newTask,
        id,
        status: newTask.type === 'non-flexible' ? 'running' : 'idle',
        progress: 0,
        createdAt: now,
        updatedAt: now,
      };
      setTasks(prev => [...prev, task]);
    },
    []
  );

  const deleteTask = useCallback((id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  }, []);

  const manualTrigger = useCallback(
    (id: string, action: 'run' | 'pause' | 'delay') => {
      setTasks(prev =>
        prev.map(t => {
          if (t.id !== id) return t;
          const statusMap: Record<string, Task['status']> = {
            run: 'running',
            pause: 'paused',
            delay: 'delayed',
          };
          return { ...t, status: statusMap[action] ?? t.status, updatedAt: new Date().toISOString() };
        })
      );
    },
    []
  );

  const runOptimization = useCallback(
    (
      method: 'greedy' | 'knapsack',
      greenWindows: GreenWindow[],
      baselineIntensity: number,
      addLog: (msg: string) => void
    ) => {
      if (greenWindows.length === 0) {
        addLog('DeviceAgent: Optimization skipped — no active Green Windows detected.');
        return;
      }

      if (method === 'greedy') {
        setTasks(prev => {
          const result = scheduleGreedy(prev, greenWindows);
          addLog(
            'DeviceAgent: Greedy Scheduling executed — flexible tasks allocated to ranked Green Windows.'
          );
          Object.entries(result.windowAllocations).forEach(([wId, tIds]) => {
            const win = greenWindows.find(w => w.id === wId);
            if (tIds.length > 0 && win) {
              const names = tIds
                .map(id => prev.find(t => t.id === id)?.name)
                .filter(Boolean)
                .join(', ');
              addLog(
                `[Allocation] Window @ ${new Date(win.startTime).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })} → ${names}`
              );
            }
          });
          return result.scheduledTasks;
        });
      } else {
        const activeWindow = greenWindows[0];
        setTasks(prev => {
          const result = optimizeKnapsack(prev, activeWindow, baselineIntensity);
          const selectedIds = new Set(result.selectedTasks.map(s => s.id));
          const updated = prev.map(t => {
            if (t.type === 'flexible' && t.status !== 'completed') {
              return {
                ...t,
                status: (selectedIds.has(t.id) ? 'delayed' : 'paused') as Task['status'],
                assignedWindowId: selectedIds.has(t.id) ? activeWindow.id : t.assignedWindowId,
                updatedAt: new Date().toISOString(),
              };
            }
            return t;
          });
          addLog(
            `DeviceAgent: Knapsack Optimization executed — ${result.selectedTasks.length} task(s) selected, ` +
              `${result.totalSavedCo2.toFixed(1)}g CO₂ savings in ${activeWindow.duration}min window.`
          );
          return updated;
        });
      }
    },
    []
  );

  const updateTaskProgress = useCallback(
    (id: string, progress: number, status: Task['status']) => {
      setTasks(prev =>
        prev.map(t =>
          t.id === id
            ? { ...t, progress, status, updatedAt: new Date().toISOString() }
            : t
        )
      );
    },
    []
  );

  const addSavings = useCallback((grams: number) => {
    setTotalSavingsGrams(s => s + grams);
  }, []);

  const resetAll = useCallback(() => {
    setTotalSavingsGrams(0);
    setTasks(
      DEFAULT_TASKS.map(t => ({
        ...t,
        progress: 0,
        status: (t.type === 'non-flexible' ? 'running' : 'delayed') as Task['status'],
        updatedAt: new Date().toISOString(),
      }))
    );
  }, []);

  return {
    tasks,
    totalSavingsGrams,
    addTask,
    deleteTask,
    manualTrigger,
    runOptimization,
    updateTaskProgress,
    addSavings,
    resetAll,
  };
}

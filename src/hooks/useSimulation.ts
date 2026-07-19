/**
 * useSimulation — Time-based simulation loop.
 *
 * Manages:
 *   - Simulation on/off toggle
 *   - Clock offset advancement (minutes-per-real-second)
 *   - Per-tick task state machine (run → complete, pause on carbon spike, resume on green)
 *   - Carbon savings calculation per tick
 *   - Console log generation
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchCarbonData } from '../services/electricityMaps';
import type { CarbonResponse } from '../services/electricityMaps';
import type { Task } from '../types/domain';

interface UseSimulationOptions {
  carbonData: CarbonResponse | null;
  apiKey: string | null;
  lowCarbonThreshold: number;
  baselineIntensity: number;
  onCarbonUpdate: (data: CarbonResponse) => void;
  onTasksUpdate: (updater: (prev: Task[]) => Task[]) => void;
  onSavings: (grams: number) => void;
  addLog: (msg: string) => void;
}

interface UseSimulationResult {
  isSimulating: boolean;
  simulationSpeed: number;
  currentOffsetHours: number;
  toggleSimulation: () => void;
  setSimulationSpeed: (speed: number) => void;
  resetOffset: () => void;
}

export function useSimulation({
  carbonData,
  apiKey,
  lowCarbonThreshold,
  baselineIntensity,
  onCarbonUpdate,
  onTasksUpdate,
  onSavings,
  addLog,
}: UseSimulationOptions): UseSimulationResult {
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationSpeed, setSimulationSpeed] = useState(15); // minutes per real second
  const [currentOffsetHours, setCurrentOffsetHours] = useState(0);

  // Use refs for values accessed inside setInterval to avoid stale closures
  const offsetRef = useRef(currentOffsetHours);
  const speedRef = useRef(simulationSpeed);
  const zoneRef = useRef(carbonData?.zone ?? 'US-CA');

  useEffect(() => { offsetRef.current = currentOffsetHours; }, [currentOffsetHours]);
  useEffect(() => { speedRef.current = simulationSpeed; }, [simulationSpeed]);
  useEffect(() => { if (carbonData) zoneRef.current = carbonData.zone; }, [carbonData]);

  const toggleSimulation = useCallback(() => setIsSimulating(s => !s), []);

  const resetOffset = useCallback(() => setCurrentOffsetHours(0), []);

  // Simulation tick loop
  useEffect(() => {
    if (!isSimulating || !carbonData) return;

    const intervalId = setInterval(async () => {
      const minutesElapsed = speedRef.current;
      const hoursElapsed = minutesElapsed / 60;
      const newOffset = offsetRef.current + hoursElapsed;
      setCurrentOffsetHours(newOffset);
      offsetRef.current = newOffset;

      try {
        const data = await fetchCarbonData(zoneRef.current, apiKey, newOffset);
        onCarbonUpdate(data);

        const currentIntensity = data.current.carbonIntensity;

        onTasksUpdate(prevTasks =>
          prevTasks.map(task => {
            let { progress, status } = task;

            if (status === 'running') {
              progress += (minutesElapsed / task.duration) * 100;
              if (progress >= 100) {
                progress = 100;
                status = 'completed';
                addLog(`DeviceAgent: Task "${task.name}" completed.`);
              } else {
                // Accumulate carbon savings
                const hoursFraction = minutesElapsed / 60;
                const kW = task.powerDraw / 1000;
                const saved = hoursFraction * kW * Math.max(0, baselineIntensity - currentIntensity);
                if (saved > 0) onSavings(saved);

                // Auto-pause flexible tasks during carbon spike
                if (task.type === 'flexible' && currentIntensity > lowCarbonThreshold * 1.5) {
                  status = 'paused';
                  addLog(
                    `DeviceAgent: Carbon surge to ${currentIntensity} g/kWh — auto-pausing "${task.name}".`
                  );
                }
              }
            } else if (status === 'paused') {
              // Auto-resume when grid returns to green
              if (task.type === 'flexible' && currentIntensity < lowCarbonThreshold) {
                status = 'running';
                addLog(
                  `DeviceAgent: Grid green (${currentIntensity} g/kWh) — resuming "${task.name}".`
                );
              }
            } else if (status === 'delayed' || status === 'idle') {
              // Start scheduled tasks when grid enters green window
              if (currentIntensity < lowCarbonThreshold) {
                status = 'running';
                addLog(
                  `DeviceAgent: Green Window active (${currentIntensity} g/kWh) — starting "${task.name}".`
                );
              }
            }

            return { ...task, progress, status };
          })
        );
      } catch (err) {
        console.error('[useSimulation] tick error:', err);
      }
    }, 1000);

    return () => clearInterval(intervalId);
  }, [
    isSimulating,
    carbonData,
    apiKey,
    lowCarbonThreshold,
    baselineIntensity,
    onCarbonUpdate,
    onTasksUpdate,
    onSavings,
    addLog,
  ]);

  return {
    isSimulating,
    simulationSpeed,
    currentOffsetHours,
    toggleSimulation,
    setSimulationSpeed,
    resetOffset,
  };
}

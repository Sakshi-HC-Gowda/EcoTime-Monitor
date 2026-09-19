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
  const zoneRef = useRef<string | null | ''>(carbonData?.zone ?? '');

  useEffect(() => { offsetRef.current = currentOffsetHours; }, [currentOffsetHours]);
  useEffect(() => { speedRef.current = simulationSpeed; }, [simulationSpeed]);
  useEffect(() => { if (carbonData) zoneRef.current = carbonData.zone ?? ''; }, [carbonData]);

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
        const zoneToFetch = zoneRef.current;
        if (!zoneToFetch) {
          // Skip fetch if zone is not yet resolved
          return;
        }

        const data = await fetchCarbonData(zoneToFetch, apiKey, newOffset);
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
              }
            }

            return { ...task, progress, status };
          })
        );
      } catch (err: any) {
        console.error('[useSimulation] Tick error', err);
      }
    }, 1000);

    return () => clearInterval(intervalId);
  }, [isSimulating, carbonData, apiKey, onCarbonUpdate, onTasksUpdate, onSavings, addLog, baselineIntensity]);

  return {
    isSimulating,
    simulationSpeed,
    currentOffsetHours,
    toggleSimulation,
    setSimulationSpeed,
    resetOffset,
  };
}

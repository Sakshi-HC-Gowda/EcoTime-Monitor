import type { ForecastPoint, Task } from '@/types/domain';

/** One possible start time for an activity, with its estimated emissions. */
export interface StartOption {
  index: number;
  start: string;
  end: string;
  avgIntensity: number; // gCO2e/kWh, minute-weighted over the run
  grams: number; // estimated gCO2e
}

export interface WhatIfAnalysis {
  energyKwh: number;
  options: StartOption[]; // feasible starts only, chronological
  baseline: StartOption | null; // earliest feasible start ("run as soon as allowed")
  best: StartOption | null; // lowest emissions; earliest wins ties
  savedGrams: number;
  savedPercent: number;
}

const HOUR_MS = 3_600_000;

/** Same eligibility rule the backend optimizer applies before moving an activity. */
export function isMovable(task: Pick<Task, 'type' | 'priorityScore'>): boolean {
  return task.type === 'flexible' && task.priorityScore < 80;
}

/** Energy (kWh) = power (W) x duration (min) / 60000. Matches the backend formula. */
export function energyKwh(powerWatts: number, minutes: number): number {
  return (powerWatts * minutes) / 60_000;
}

/**
 * Estimated emissions if the activity starts at forecast point `index`.
 * Each point is treated as covering the hour that starts at its timestamp; the
 * run's minutes are weighted by the intensity of the hour they fall in.
 * Returns null when the forecast is too short to cover the whole run.
 */
export function evaluateStart(
  points: ForecastPoint[],
  index: number,
  minutes: number,
  powerWatts: number,
): StartOption | null {
  if (!(minutes > 0) || !(powerWatts >= 0)) return null;
  const hoursNeeded = Math.ceil(minutes / 60);
  if (index < 0 || index + hoursNeeded > points.length) return null;

  let weighted = 0;
  let remaining = minutes;
  for (let h = 0; h < hoursNeeded; h += 1) {
    const slice = Math.min(60, remaining);
    weighted += points[index + h].carbonIntensity * slice;
    remaining -= slice;
  }
  const avgIntensity = weighted / minutes;
  const startMs = new Date(points[index].datetime).getTime();
  if (!Number.isFinite(startMs)) return null;

  return {
    index,
    start: new Date(startMs).toISOString(),
    end: new Date(startMs + minutes * 60_000).toISOString(),
    avgIntensity,
    grams: energyKwh(powerWatts, minutes) * avgIntensity,
  };
}

/** All feasible starts within the forecast, honoring earliestStart and deadline. */
export function analyseActivity(
  points: ForecastPoint[],
  task: Pick<Task, 'duration' | 'powerDraw' | 'earliestStart' | 'deadline'>,
  now: number = Date.now(),
): WhatIfAnalysis {
  const earliest = task.earliestStart ? new Date(task.earliestStart).getTime() : -Infinity;
  const deadline = task.deadline ? new Date(task.deadline).getTime() : Infinity;
  const options: StartOption[] = [];

  for (let i = 0; i < points.length; i += 1) {
    const option = evaluateStart(points, i, task.duration, task.powerDraw);
    if (!option) continue;
    const startMs = new Date(option.start).getTime();
    const endMs = new Date(option.end).getTime();
    // The first point is "now" (its hour may have started a few minutes ago).
    if (i > 0 && startMs < now) continue;
    if (startMs + HOUR_MS <= now) continue;
    if (startMs < earliest && i > 0) continue;
    if (i === 0 && earliest > now + HOUR_MS) continue;
    if (endMs > deadline) continue;
    options.push(option);
  }

  const baseline = options[0] ?? null;
  const best = options.reduce<StartOption | null>(
    (winner, option) => (winner === null || option.grams < winner.grams - 1e-9 ? option : winner),
    null,
  );
  const savedGrams = baseline && best ? baseline.grams - best.grams : 0;
  const savedPercent = baseline && baseline.grams > 0 ? (savedGrams / baseline.grams) * 100 : 0;

  return {
    energyKwh: energyKwh(task.powerDraw, task.duration),
    options,
    baseline,
    best,
    savedGrams,
    savedPercent,
  };
}

export function formatGrams(grams: number): string {
  return Math.abs(grams) >= 1000 ? `${(grams / 1000).toFixed(2)} kgCO₂e` : `${grams.toFixed(1)} gCO₂e`;
}

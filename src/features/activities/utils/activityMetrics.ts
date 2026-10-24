import type { GreenWindow, Task } from '@/types/domain';
import {
  calculateCarbonScore,
  calculateEcoScore,
  calculateEmissionsGrams,
  calculateEnergyKwh,
} from '@/utils/carbonMetrics';

type TaskLike = Pick<Task, 'duration' | 'powerDraw' | 'flexibilityScore' | 'priorityScore'> &
  Partial<Pick<Task, 'estimatedEnergyConsumption' | 'estimatedCarbonImpact' | 'ecoScore' | 'recommendation' | 'recommendedStartTime' | 'earliestStart' | 'deadline'>>;

type ScoreInputs = Pick<Task, 'flexibilityScore' | 'priorityScore'> &
  Partial<Pick<Task, 'ecoScore'>>;
type ScheduleTimeInputs = Pick<Task, 'duration'> &
  Partial<Pick<Task, 'recommendedStartTime' | 'earliestStart' | 'deadline'>>;

export function getEstimatedEnergyKwh(task: TaskLike): number {
  if (
    typeof task.estimatedEnergyConsumption === 'number'
    && Number.isFinite(task.estimatedEnergyConsumption)
    && task.estimatedEnergyConsumption >= 0
  ) {
    return task.estimatedEnergyConsumption;
  }
  return calculateEnergyKwh(task.powerDraw, task.duration);
}

export function getEstimatedCarbonImpact(
  task: TaskLike,
  carbonIntensity?: number,
): number | null {
  if (carbonIntensity === undefined) return null;
  return calculateEmissionsGrams(getEstimatedEnergyKwh(task), carbonIntensity);
}

export function getEstimatedEcoScore(
  task: ScoreInputs,
  currentIntensity?: number,
  baselineIntensity = 380,
  peakIntensity = 800,
): number | null {
  if (currentIntensity === undefined) {
    return typeof task.ecoScore === 'number'
      && Number.isFinite(task.ecoScore)
      && task.ecoScore >= 0
      && task.ecoScore <= 100
      ? task.ecoScore
      : null;
  }
  return calculateEcoScore(
    calculateCarbonScore(currentIntensity, baselineIntensity, peakIntensity),
    task.flexibilityScore,
    task.priorityScore,
  );
}

export function getRecommendationText(task: Partial<Pick<Task, 'recommendation'>>): string {
  if (task.recommendation) {
    return task.recommendation;
  }
  return 'Use optimizer for a recommendation';
}

export function getRecommendedStartTimeIso(
  task: ScheduleTimeInputs,
  greenWindows: GreenWindow[] = [],
): string | undefined {
  const earliest = task.earliestStart ? new Date(task.earliestStart) : undefined;
  const deadline = task.deadline ? new Date(task.deadline) : undefined;
  if (
    (earliest && !Number.isFinite(earliest.getTime()))
    || (deadline && !Number.isFinite(deadline.getTime()))
    || (earliest && deadline && earliest >= deadline)
  ) return undefined;
  if (task.recommendedStartTime) {
    const recommended = new Date(task.recommendedStartTime);
    if (
      Number.isFinite(recommended.getTime())
      && (!earliest || recommended >= earliest)
      && (!deadline || recommended.getTime() + task.duration * 60_000 <= deadline.getTime())
    ) return task.recommendedStartTime;
  }

  for (const window of greenWindows) {
    const start = new Date(window.startTime);
    const end = window.endTime
      ? new Date(window.endTime)
      : new Date(start.getTime() + window.duration * 60_000);
    const scheduledStart = earliest && start < earliest ? earliest : start;
    const finish = new Date(scheduledStart.getTime() + task.duration * 60_000);
    if (
      Number.isFinite(start.getTime())
      && Number.isFinite(end.getTime())
      && (!deadline || finish <= deadline)
      && scheduledStart >= start
      && finish <= end
    ) return scheduledStart.toISOString();
  }
  return undefined;
}

export function formatRecommendedTime(iso?: string): string {
  if (!iso) return 'No feasible window';
  const date = new Date(iso);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

import type { GreenWindow, Task } from '@/types/domain';

type TaskLike = Pick<Task, 'duration' | 'powerDraw' | 'flexibilityScore' | 'priorityScore'> &
  Partial<Pick<Task, 'estimatedEnergyConsumption' | 'estimatedCarbonImpact' | 'ecoScore' | 'recommendation' | 'recommendedStartTime' | 'createdAt'>>;

const DEFAULT_CARBON_INTENSITY = 180;

export function getEstimatedEnergyKwh(task: TaskLike): number {
  if (typeof task.estimatedEnergyConsumption === 'number') {
    return task.estimatedEnergyConsumption;
  }
  return (task.powerDraw * task.duration) / 60000;
}

export function getEstimatedCarbonImpact(task: TaskLike): number {
  if (typeof task.estimatedCarbonImpact === 'number') {
    return task.estimatedCarbonImpact;
  }
  return getEstimatedEnergyKwh(task) * DEFAULT_CARBON_INTENSITY;
}

export function getEstimatedEcoScore(task: TaskLike): number {
  if (typeof task.ecoScore === 'number') {
    return task.ecoScore;
  }

  const energyPenalty = Math.min(100, (task.powerDraw * task.duration) / 900);
  return Math.max(
    0,
    Math.min(100, Math.round(100 - energyPenalty * 0.5 + task.flexibilityScore * 0.3 + (100 - task.priorityScore) * 0.2))
  );
}

export function getRecommendationText(task: TaskLike): string {
  if (task.recommendation) {
    return task.recommendation;
  }

  if (task.priorityScore >= 80) {
    return 'Run now';
  }

  if (task.flexibilityScore >= 60) {
    return 'Schedule for green window';
  }

  return 'Run now';
}

export function getRecommendedStartTimeIso(task: TaskLike, greenWindows: GreenWindow[] = []): string {
  if (task.recommendedStartTime) {
    return task.recommendedStartTime;
  }

  const fittingWindow = greenWindows.find((window) => window.duration >= task.duration);
  if (fittingWindow?.startTime) {
    return fittingWindow.startTime;
  }

  const created = task.createdAt ? new Date(task.createdAt) : new Date();
  return new Date(created.getTime() + 30 * 60_000).toISOString();
}

export function formatRecommendedTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

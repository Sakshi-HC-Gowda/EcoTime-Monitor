import type { ActivityType } from '@/types/domain';

export const ESTIMATED_POWER_WATTS: Record<ActivityType, number> = {
  'file-upload': 120,
  'cloud-backup': 120,
  'software-update': 80,
  'dataset-download': 200,
  'ci-cd-pipeline': 450,
  'batch-processing': 350,
};

export function estimateWorkloadPowerWatts(activityType: ActivityType): number {
  return ESTIMATED_POWER_WATTS[activityType];
}

function nonNegativeFinite(value: number, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative finite number.`);
  }
  return value;
}

function roundCalculation(value: number, digits = 4): number {
  const scale = 10 ** digits;
  const scaledMagnitude = Math.abs(value) * scale;
  if (!Number.isFinite(scaledMagnitude)) return value;
  return Math.sign(value) * (Math.round(scaledMagnitude) / scale);
}

export function calculateEnergyKwh(powerWatts: number, durationMinutes: number): number {
  const power = nonNegativeFinite(powerWatts, 'Power');
  const duration = nonNegativeFinite(durationMinutes, 'Duration');
  const energy = (power * duration) / 60_000;
  if (!Number.isFinite(energy)) {
    throw new RangeError('Calculated energy must be a finite number.');
  }
  return roundCalculation(energy);
}

export function calculateEmissionsGrams(energyKwh: number, intensityGPerKwh: number): number {
  const energy = nonNegativeFinite(energyKwh, 'Energy');
  const intensity = nonNegativeFinite(intensityGPerKwh, 'Carbon intensity');
  const emissions = energy * intensity;
  if (!Number.isFinite(emissions)) {
    throw new RangeError('Calculated emissions must be a finite number.');
  }
  return roundCalculation(emissions);
}

export function calculateSavingsFromEmissions(
  baselineEmissionsGrams: number,
  recommendedEmissionsGrams: number,
): number {
  const baseline = nonNegativeFinite(baselineEmissionsGrams, 'Baseline emissions');
  const recommended = nonNegativeFinite(recommendedEmissionsGrams, 'Recommended emissions');
  return roundCalculation(baseline - recommended);
}

export function calculateSavingsGrams(
  durationMinutes: number,
  powerWatts: number,
  baselineIntensity: number,
  recommendedIntensity: number,
): number {
  const energy = calculateEnergyKwh(powerWatts, durationMinutes);
  return calculateSavingsFromEmissions(
    calculateEmissionsGrams(energy, baselineIntensity),
    calculateEmissionsGrams(energy, recommendedIntensity),
  );
}

export function calculateCarbonScore(
  currentIntensity: number,
  baselineIntensity: number,
  peakIntensity: number,
): number {
  const current = nonNegativeFinite(currentIntensity, 'Current intensity');
  const baseline = nonNegativeFinite(baselineIntensity, 'Baseline intensity');
  const peak = nonNegativeFinite(peakIntensity, 'Peak intensity');
  const range = Math.max(50, peak - baseline * 0.5);
  const score = Math.max(0, Math.min(100, ((peak - current) / range) * 100));
  return Math.round(score * 10) / 10;
}

export function calculateEcoScore(
  carbonScore: number,
  flexibilityScore: number,
  priorityScore: number,
): number {
  for (const [value, name] of [
    [carbonScore, 'Carbon score'],
    [flexibilityScore, 'Flexibility score'],
    [priorityScore, 'Priority score'],
  ] as const) {
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new RangeError(`${name} must be a finite number from 0 to 100.`);
    }
  }
  const score = 0.5 * carbonScore + 0.3 * flexibilityScore + 0.2 * priorityScore;
  return Math.round(score * 10) / 10;
}

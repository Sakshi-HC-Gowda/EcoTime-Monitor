/**
 * EcoTime Shared Domain Types
 * Used across frontend and backend for type safety and contract enforcement
 */

// ============================================================================
// CARBON DATA & FORECAST
// ============================================================================

export interface CarbonDataPoint {
  datetime: string;
  carbonIntensity: number; // gCO2e/kWh
}

export interface CarbonResponse {
  zone: string;
  current: CarbonDataPoint;
  history: CarbonDataPoint[];
  forecast: CarbonDataPoint[];
  isSimulated: boolean;
  error?: string;
}

export interface GridZone {
  id: string;
  name: string;
  country: string;
  type: 'solar' | 'wind' | 'nuclear' | 'coal' | 'mixed';
  baseIntensity: number;
  amplitude: number;
  noise: number;
}

// ============================================================================
// ACTIVITY / TASK
// ============================================================================

export type ActivityType = 
  | 'file-upload'
  | 'cloud-backup'
  | 'software-update'
  | 'dataset-download'
  | 'ci-cd-pipeline'
  | 'batch-processing';

export type TaskFlexibility = 'flexible' | 'non-flexible';

export type TaskStatus = 'idle' | 'running' | 'paused' | 'delayed' | 'completed';

export interface Task {
  id: string;
  name: string;
  type: TaskFlexibility;
  activityType: ActivityType;
  category?: string;
  flexibilityScore: number; // 0-100
  priorityScore: number; // 0-100
  duration: number; // minutes
  powerDraw: number; // Watts
  estimatedEnergyConsumption?: number; // kWh
  status: TaskStatus;
  progress: number; // 0-100
  assignedWindowId?: string;
  executionStartTime?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskRequest {
  name: string;
  type: TaskFlexibility;
  activityType: ActivityType;
  duration: number;
  powerDraw: number;
  priorityScore: number;
  flexibilityScore?: number;
}

export interface SchedulerRecommendation {
  id?: number;
  activityId?: string;
  text: string;
  reason?: string;
  expectedCarbonSaving?: number;
  expectedEnergySaving?: number;
  recommendedStartTime?: string;
  ecoScore?: number;
  forecastUsed?: string;
  status?: string;
  createdAt?: string;
}

export interface SchedulerActivity extends Task {
  scheduledAt?: string;
  currentStatus?: string;
  recommendation?: SchedulerRecommendation | null;
  ecoScore?: number | null;
  carbonSaved?: number | null;
  scheduleSlot?: Record<string, unknown> | null;
}

export interface SchedulerSnapshot {
  activities: SchedulerActivity[];
  today: SchedulerActivity[];
  upcoming: SchedulerActivity[];
  summary: {
    total: number;
    pending: number;
    scheduled: number;
    running: number;
    completed: number;
    missed: number;
    cancelled: number;
  };
}

export interface SchedulerActionRequest {
  activityId: string;
  action?: string;
  scheduledAt?: string;
  assignedWindowId?: string;
  status?: string;
}

export interface UpdateTaskRequest {
  status?: TaskStatus;
  progress?: number;
  assignedWindowId?: string;
}

// ============================================================================
// GREEN WINDOWS & OPTIMIZATION
// ============================================================================

export interface GreenWindow {
  id: string;
  startTime: string;
  endTime?: string;
  duration: number; // minutes
  avgCarbonIntensity: number;
  minCarbonIntensity?: number;
  carbonSavingPercent: number;
  userConvenience: number; // 0-100
  ecoScore?: number;
  rank?: number;
  recommendation?: string;
  detectedAt?: string;
}

export interface ForecastPoint extends CarbonDataPoint {
  isML?: boolean;
  confidenceLower?: number;
  confidenceUpper?: number;
}

export interface ForecastResponse {
  zone: string;
  forecast: ForecastPoint[];
  model: {
    model_name: string;
    is_trained: boolean;
    trained_at?: string;
  };
}

export interface ForecastModelInfo {
  model_name: string;
  is_trained: boolean;
  trained_at?: string;
  feature_count?: number;
  metrics?: Record<string, number>;
  cv_results?: Record<string, number>;
  training_status?: {
    running: boolean;
    last_started?: string;
    last_finished?: string;
    error?: string;
  };
}

export interface EcoScore {
  taskId: string;
  carbonScore: number; // 0-100
  flexibilityScore: number; // 0-100
  priorityScore: number; // 0-100
  ecoScore: number; // weighted sum
  recommendation: 'Execute Now' | 'Delay Execution' | 'Schedule Automatically' | 'Pause Activity' | 'Resume Activity';
  reason: string;
}

export interface WindowScore {
  windowId: string;
  carbonSavingScore: number; // 0-100
  userConvenienceScore: number; // 0-100
  durationScore: number; // 0-100
  totalScore: number; // weighted sum
  rank: number;
}

export interface OptimizationResult {
  method: 'greedy' | 'knapsack';
  windowId: string;
  selectedTasks: Task[];
  totalSavedCo2: number; // grams
  totalDuration: number; // minutes
  windowCapacity: number; // minutes
  utilizationPercent: number;
  createdAt: string;
}

export interface SchedulingRequest {
  tasks: Task[];
  window: GreenWindow;
  method: 'greedy' | 'knapsack';
  baselineIntensity: number;
}

export interface SchedulingResponse {
  result: OptimizationResult;
  tasks: Task[]; // Updated task list with assignments
}

// ============================================================================
// ORCHESTRATION & STATE
// ============================================================================

export interface OrchestrationState {
  id: string;
  currentIntensity: number;
  activeWindow?: GreenWindow;
  runningTasks: Task[];
  allTasks: Task[];
  totalSavingsGrams: number;
  lastUpdated: string;
}

export interface SimulationConfig {
  zone: string;
  apiKey?: string;
  lowCarbonThreshold: number;
  baselineIntensity: number;
  simulationSpeed: number; // minutes per real second
  isSimulating: boolean;
}

// ============================================================================
// API RESPONSE WRAPPER
// ============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ============================================================================
// ANALYTICS, HISTORY, RECOMMENDATIONS & STATUS
// ============================================================================

export interface TodaysActivities {
  total: number;
  completed: number;
  pending: number;
  postponed: number;
  cancelled: number;
}

export interface WeeklySummary {
  totalActivities: number;
  completed: number;
  averageCarbonIntensity: number;
  energySavedKwh: number;
  carbonSavedKg: number;
}

export interface EcoScoreBreakdown {
  ecoScore: number;
  completedRatio: number;
  greenRecommendationRatio: number;
  carbonSavingsScore: number;
}

export interface EcoScoreTrendPoint {
  label: string;
  date: string;
  score: number;
}

export interface EcoScoreTrend {
  daily: EcoScoreTrendPoint[];
  weekly: EcoScoreTrendPoint[];
  monthly: EcoScoreTrendPoint[];
}

export interface AnalyticsSummary {
  totalEnergySavedKwh: number;
  totalCarbonSavedKg: number;
  totalCarbonSavedGrams: number;
  recommendationsFollowed: number;
  todaysActivities: TodaysActivities;
  weeklySummary: WeeklySummary;
  ecoScore: EcoScoreBreakdown;
  ecoScoreTrend: EcoScoreTrend;
}

export type RecommendationStatus = 'pending' | 'accepted' | 'rejected' | 'expired';

export interface RecommendationRecord {
  id: number;
  activityId: string | null;
  text: string;
  reason: string | null;
  expectedCarbonSaving: number | null;
  expectedEnergySaving: number | null;
  status: RecommendationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardSummary {
  ecoScore: number;
  totalEnergySavedKwh: number;
  totalCarbonSavedKg: number;
  todaysActivities: TodaysActivities;
  weeklySummary: WeeklySummary;
  latestRecommendation: RecommendationRecord | null;
}

export interface ActivityHistoryRecord {
  id: number;
  activityId: string;
  previousStatus: TaskStatus | null;
  newStatus: TaskStatus;
  executionTime: number | null; // seconds spent in previous status
  recommendationId: number | null;
  createdAt: string;
}

export interface StatusCounts {
  running: number;
  completed: number;
  postponed: number;
  cancelled: number;
  pending: number;
  total: number;
}

export interface SystemStatus {
  isActive: boolean;
  updatedAt: string | null;
}

export interface StatusSummary {
  counts: StatusCounts;
  system: SystemStatus;
}

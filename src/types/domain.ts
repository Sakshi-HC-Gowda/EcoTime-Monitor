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
  duration: number; // minutes
  avgCarbonIntensity: number;
  carbonSavingPercent: number;
  userConvenience: number; // 0-100
  detectedAt?: string;
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

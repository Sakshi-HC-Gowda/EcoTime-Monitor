import { useState, useEffect, useCallback } from 'react';
import { LayoutDashboard, Terminal, Settings as SettingsIcon, Leaf, Sun, AlertTriangle, ShieldCheck } from 'lucide-react';
import { Dashboard } from './components/Dashboard';
import { AgentSimulator } from './components/AgentSimulator';
import { SavingsCard } from './components/SavingsCard';
import { Settings } from './components/Settings';
import { fetchCarbonData } from './services/electricityMaps';
import type { CarbonResponse, CarbonDataPoint } from './services/electricityMaps';
import { scheduleGreedy, optimizeKnapsack } from './utils/algorithms';
import type { Task, GreenWindow } from './utils/algorithms';

// Initial default tasks for the registry
const DEFAULT_TASKS: Task[] = [
  {
    id: 'task-1',
    name: 'Weekly Database Backup',
    type: 'flexible',
    flexibilityScore: 85,
    priorityScore: 35,
    duration: 90,
    powerDraw: 350,
    status: 'delayed',
    progress: 0,
  },
  {
    id: 'task-2',
    name: 'Docker Base Images Pull',
    type: 'flexible',
    flexibilityScore: 70,
    priorityScore: 50,
    duration: 40,
    powerDraw: 220,
    status: 'delayed',
    progress: 0,
  },
  {
    id: 'task-3',
    name: 'Production Build CI Pipeline',
    type: 'flexible',
    flexibilityScore: 55,
    priorityScore: 75,
    duration: 25,
    powerDraw: 480,
    status: 'delayed',
    progress: 0,
  },
  {
    id: 'task-4',
    name: 'Real-time Analytics Feed',
    type: 'non-flexible',
    flexibilityScore: 0,
    priorityScore: 90,
    duration: 120,
    powerDraw: 95,
    status: 'running',
    progress: 0,
  }
];

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'simulator' | 'settings'>('dashboard');
  
  // Settings State (persisted in localStorage where appropriate)
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('ecotime_api_key') || '');
  const [selectedZone, setSelectedZone] = useState<string>(() => localStorage.getItem('ecotime_zone') || 'US-CA');
  const [lowCarbonThreshold, setLowCarbonThreshold] = useState<number>(180);
  const [baselineIntensity, setBaselineIntensity] = useState<number>(380);

  // Simulation State
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [simulationSpeed, setSimulationSpeed] = useState<number>(15); // minutes of sim per real second
  const [currentOffsetHours, setCurrentOffsetHours] = useState<number>(0);
  const [totalSavingsGrams, setTotalSavingsGrams] = useState<number>(0);

  // Carbon Intensity Data
  const [carbonData, setCarbonData] = useState<CarbonResponse | null>(null);
  const [greenWindows, setGreenWindows] = useState<GreenWindow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Task Registry State
  const [tasks, setTasks] = useState<Task[]>(DEFAULT_TASKS);
  
  // Console logs
  const [logs, setLogs] = useState<string[]>([]);

  // Logger helper
  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs(prev => [...prev, `${timestamp} - ${message}`].slice(-60)); // Limit to last 60 logs
  }, []);

  // Sync API bindings
  const handleApiKeyChange = (key: string) => {
    setApiKey(key);
    localStorage.setItem('ecotime_api_key', key);
    addLog(`System: API Key updated. Re-establishing connection...`);
  };

  const handleZoneChange = (zone: string) => {
    setSelectedZone(zone);
    localStorage.setItem('ecotime_zone', zone);
    setCurrentOffsetHours(0); // Reset offset on zone change
    addLog(`System: Grid zone changed to ${zone}. Resetting simulation clock.`);
  };

  // Detect green windows from forecast data
  const detectGreenWindows = useCallback((forecast: CarbonDataPoint[], threshold: number): GreenWindow[] => {
    const windows: GreenWindow[] = [];
    let currentWindowPoints: CarbonDataPoint[] = [];
    let windowCount = 0;
    
    // Find peak intensity of forecast for savings baseline
    const forecastPeak = Math.max(...forecast.map(p => p.carbonIntensity), 300);

    for (let i = 0; i < forecast.length; i++) {
      const point = forecast[i];
      if (point.carbonIntensity < threshold) {
        currentWindowPoints.push(point);
      } else {
        if (currentWindowPoints.length > 0) {
          windowCount++;
          const avgIntensity = currentWindowPoints.reduce((acc, p) => acc + p.carbonIntensity, 0) / currentWindowPoints.length;
          const savingsPercent = Math.max(5, ((forecastPeak - avgIntensity) / forecastPeak) * 100);
          
          const startDate = new Date(currentWindowPoints[0].datetime);
          const startHour = startDate.getHours();
          let userConvenience = 60;
          if (startHour >= 22 || startHour <= 5) {
            userConvenience = 90; // Night backups
          } else if (startHour >= 9 && startHour <= 17) {
            userConvenience = 75; // Daytime working
          }

          windows.push({
            id: `win-${windowCount}`,
            startTime: currentWindowPoints[0].datetime,
            duration: currentWindowPoints.length * 60, // 60 mins per point
            avgCarbonIntensity: Math.round(avgIntensity),
            carbonSavingPercent: savingsPercent,
            userConvenience
          });
          currentWindowPoints = [];
        }
      }
    }

    if (currentWindowPoints.length > 0) {
      windowCount++;
      const avgIntensity = currentWindowPoints.reduce((acc, p) => acc + p.carbonIntensity, 0) / currentWindowPoints.length;
      const savingsPercent = Math.max(5, ((forecastPeak - avgIntensity) / forecastPeak) * 100);
      const startDate = new Date(currentWindowPoints[0].datetime);
      const startHour = startDate.getHours();
      let userConvenience = 60;
      if (startHour >= 22 || startHour <= 5) {
        userConvenience = 90;
      } else if (startHour >= 9 && startHour <= 17) {
        userConvenience = 75;
      }

      windows.push({
        id: `win-${windowCount}`,
        startTime: currentWindowPoints[0].datetime,
        duration: currentWindowPoints.length * 60,
        avgCarbonIntensity: Math.round(avgIntensity),
        carbonSavingPercent: savingsPercent,
        userConvenience
      });
    }

    return windows;
  }, []);

  // Fetch carbon data load/refresh
  const loadCarbonData = useCallback(async (offset: number = 0) => {
    try {
      const data = await fetchCarbonData(selectedZone, apiKey || null, offset);
      setCarbonData(data);
      
      const detected = detectGreenWindows(data.forecast, lowCarbonThreshold);
      setGreenWindows(detected);
      
      if (loading) {
        setLoading(false);
        addLog(`System: Connected to ${data.isSimulated ? 'Simulated Grid' : 'Electricity Maps API'}. Loaded carbon data for ${selectedZone}.`);
      }
    } catch (err) {
      console.error(err);
      addLog(`System Error: Failed to acquire carbon grid statistics.`);
    }
  }, [selectedZone, apiKey, lowCarbonThreshold, detectGreenWindows, loading, addLog]);

  // Load carbon data on startup and config changes
  useEffect(() => {
    loadCarbonData(currentOffsetHours);
  }, [selectedZone, apiKey, currentOffsetHours, loadCarbonData]);

  // Task modifiers
  const handleAddTask = (newTask: Omit<Task, 'id' | 'status' | 'progress'>) => {
    const id = `task-${Date.now()}`;
    const task: Task = {
      ...newTask,
      id,
      status: newTask.type === 'non-flexible' ? 'running' : 'idle',
      progress: 0,
    };
    setTasks(prev => [...prev, task]);
    addLog(`DeviceAgent: Registered new task "${task.name}" (${task.type}, Duration: ${task.duration}m, Power: ${task.powerDraw}W).`);
  };

  const handleDeleteTask = (id: string) => {
    const taskToDelete = tasks.find(t => t.id === id);
    setTasks(prev => prev.filter(t => t.id !== id));
    if (taskToDelete) {
      addLog(`DeviceAgent: Removed task "${taskToDelete.name}" from registry.`);
    }
  };

  const handleManualTrigger = (id: string, action: 'run' | 'pause' | 'delay') => {
    setTasks(prev => prev.map(t => {
      if (t.id === id) {
        let status: Task['status'] = t.status;
        if (action === 'run') {
          status = 'running';
          addLog(`DeviceAgent: Manual override - Starting execution for task "${t.name}".`);
        } else if (action === 'pause') {
          status = 'paused';
          addLog(`DeviceAgent: Manual override - Paused execution for task "${t.name}".`);
        } else if (action === 'delay') {
          status = 'delayed';
          addLog(`DeviceAgent: Manual override - Scheduled/delayed task "${t.name}".`);
        }
        return { ...t, status };
      }
      return t;
    }));
  };

  // Run Scheduling Algorithms
  const handleRunOptimization = (method: 'greedy' | 'knapsack') => {
    if (greenWindows.length === 0) {
      addLog(`DeviceAgent: Optimization skipped. No active Green Windows detected to schedule into.`);
      return;
    }

    if (method === 'greedy') {
      const result = scheduleGreedy(tasks, greenWindows);
      setTasks(result.scheduledTasks);
      addLog(`DeviceAgent: Executed Greedy Scheduling Algorithm. Sorted and allocated flexible tasks into ranked Green Windows.`);
      
      // Print allocations to console
      Object.keys(result.windowAllocations).forEach(wId => {
        const tIds = result.windowAllocations[wId];
        const win = greenWindows.find(w => w.id === wId);
        if (tIds.length > 0 && win) {
          const names = tIds.map(id => tasks.find(t => t.id === id)?.name).join(', ');
          addLog(`[Allocation] Window starting ${new Date(win.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} will execute: ${names}`);
        }
      });
    } else {
      // Run Knapsack for the first window
      const activeWindow = greenWindows[0];
      const result = optimizeKnapsack(tasks, activeWindow, baselineIntensity);
      
      setTasks(prev => prev.map(t => {
        const isSelected = result.selectedTasks.some(s => s.id === t.id);
        if (t.type === 'flexible' && t.status !== 'completed') {
          return {
            ...t,
            status: isSelected ? 'delayed' : 'paused', // Set others to paused/standby
            assignedWindowId: isSelected ? activeWindow.id : undefined,
          };
        }
        return t;
      }));

      addLog(`DeviceAgent: Executed 0/1 Knapsack Optimization. Maximized carbon savings inside upcoming ${activeWindow.duration} min Green Window (Selected: ${result.selectedTasks.length} task(s), Savings: ${result.totalSavedCo2.toFixed(1)}g CO2).`);
    }
  };

  const handleResetStatistics = () => {
    setTotalSavingsGrams(0);
    setCurrentOffsetHours(0);
    setTasks(DEFAULT_TASKS.map(t => ({ ...t, progress: 0, status: t.type === 'non-flexible' ? 'running' : 'delayed' })));
    addLog(`System: Simulation statistics and offset clock reset successfully. Restored default tasks.`);
  };

  // Simulator Time Tick Loop
  useEffect(() => {
    if (!isSimulating || !carbonData) return;

    const interval = setInterval(() => {
      // 1. Advance simulation clock (speed = minutes elapsed per real second)
      const minutesElapsed = simulationSpeed;
      const hoursElapsed = minutesElapsed / 60;
      const newOffset = currentOffsetHours + hoursElapsed;
      setCurrentOffsetHours(newOffset);

      // 2. Fetch new carbon intensity for the advanced time
      const curZone = carbonData.zone;
      const simulatedData = fetchCarbonData(curZone, apiKey || null, newOffset);
      
      simulatedData.then(data => {
        setCarbonData(data);
        const currentIntensity = data.current.carbonIntensity;

        // Detect new green windows
        const newWindows = detectGreenWindows(data.forecast, lowCarbonThreshold);
        setGreenWindows(newWindows);

        // 3. Process task list progresses and state machines
        setTasks(prevTasks => prevTasks.map(task => {
          let progress = task.progress;
          let status = task.status;

          // Resolve recommendations for logging
          if (task.status === 'running') {
            progress += (minutesElapsed / task.duration) * 100;
            if (progress >= 100) {
              progress = 100;
              status = 'completed';
              addLog(`DeviceAgent: Completed task "${task.name}".`);
            } else {
              // Calculate and add CO2 savings during this tick
              // Savings = (minutes/60) * (kW) * (Baseline - Actual)
              const hoursFraction = minutesElapsed / 60;
              const kW = task.powerDraw / 1000;
              const savings = hoursFraction * kW * (baselineIntensity - currentIntensity);
              
              if (savings > 0) {
                setTotalSavingsGrams(s => s + savings);
              }

              // Check if we should auto-pause flexible task due to carbon spike
              if (task.type === 'flexible' && currentIntensity > lowCarbonThreshold * 1.5) {
                status = 'paused';
                addLog(`DeviceAgent: Grid carbon intensity surged to ${currentIntensity} g/kWh. Auto-pausing flexible task "${task.name}" to prevent emissions.`);
              }
            }
          } else if (task.status === 'paused') {
            // Auto-resume if grid returns to green
            if (task.type === 'flexible' && currentIntensity < lowCarbonThreshold) {
              status = 'running';
              addLog(`DeviceAgent: Grid intensity dropped back to green (${currentIntensity} g/kWh). Resuming paused task "${task.name}".`);
            }
          } else if (task.status === 'delayed' || task.status === 'idle') {
            // Auto-run scheduled tasks during Green Windows
            if (currentIntensity < lowCarbonThreshold) {
              // Check if this task is assigned to an active green window or just executing now because grid is green
              status = 'running';
              addLog(`DeviceAgent: Grid entered Green Window (${currentIntensity} g/kWh). Initiating execution of scheduled task "${task.name}".`);
            }
          }

          return {
            ...task,
            progress,
            status,
          };
        }));
      }).catch(err => {
        console.error(err);
      });

    }, 1000);

    return () => clearInterval(interval);
  }, [isSimulating, simulationSpeed, currentOffsetHours, carbonData, apiKey, lowCarbonThreshold, baselineIntensity, detectGreenWindows, addLog]);

  // Set default initial logs on startup
  useEffect(() => {
    if (logs.length === 0) {
      addLog(`System: EcoTime core initialized.`);
      addLog(`System: Scanning localized carbon emission offsets...`);
    }
  }, [logs, addLog]);

  if (loading || !carbonData) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '20px' }}>
        <div style={{ width: '50px', height: '50px', border: '3px solid var(--border-glass)', borderTopColor: 'var(--green)', borderRadius: '50%', animation: 'pulse 1s infinite' }} />
        <h3 style={{ fontWeight: '600', color: 'var(--text-secondary)' }}>Establishing connection to grid...</h3>
      </div>
    );
  }

  // Quick stats calculations
  const totalTasks = tasks.length;
  const runningTasks = tasks.filter(t => t.status === 'running').length;
  const activeIntensity = carbonData.current.carbonIntensity;

  return (
    <div className="app-container">
      {/* Navigation Sidebar */}
      <aside className="sidebar">
        <div className="logo-section">
          <div className="logo-icon-wrapper">
            <Leaf size={22} color="white" />
          </div>
          <span className="logo-text">
            EcoTime <span className="logo-badge">v1.2</span>
          </span>
        </div>

        <nav className="nav-links">
          <button 
            className={`nav-link ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <LayoutDashboard size={18} />
            Carbon Dashboard
          </button>
          
          <button 
            className={`nav-link ${activeTab === 'simulator' ? 'active' : ''}`}
            onClick={() => setActiveTab('simulator')}
          >
            <Terminal size={18} />
            Agent Simulator
          </button>
          
          <button 
            className={`nav-link ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <SettingsIcon size={18} />
            Platform Settings
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="status-summary">
            <div className={`status-dot ${isSimulating ? 'active' : 'paused'}`} />
            <div>
              <div style={{ fontWeight: 'bold', fontSize: '12px' }}>
                Simulator: {isSimulating ? 'ACCELERATED' : 'STBY'}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                Zone: {carbonData.zone}
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Panel Content */}
      <main className="main-content">
        
        {/* Header */}
        <div className="header-container">
          <div>
            <h1 className="page-title">
              {activeTab === 'dashboard' && 'Intelligent Carbon Analytics'}
              {activeTab === 'simulator' && 'Device Agent Simulation'}
              {activeTab === 'settings' && 'Platform Configuration'}
            </h1>
            <p className="page-subtitle">
              {activeTab === 'dashboard' && 'Monitor grid emissions, detect Green Windows, and evaluate savings.'}
              {activeTab === 'simulator' && 'Register tasks, run optimization schedulers, and monitor executions.'}
              {activeTab === 'settings' && 'Manage Electricity Maps integration, set carbon targets, and resets.'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {/* Quick API Key connection alert indicator */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '20px',
              background: apiKey ? 'var(--green-glow)' : 'rgba(255, 255, 255, 0.02)',
              border: '1px solid ' + (apiKey ? 'var(--green-border)' : 'var(--border-glass)'),
              fontSize: '11px',
              fontWeight: '600'
            }}>
              {apiKey ? (
                <>
                  <ShieldCheck size={14} style={{ color: 'var(--green)' }} />
                  Live API Linked
                </>
              ) : (
                <>
                  <AlertTriangle size={14} style={{ color: 'var(--amber)' }} />
                  Sim Sandbox Active
                </>
              )}
            </div>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="quick-stats">
          <div className="glass-panel stat-card">
            <div className="stat-icon" style={{ 
              background: activeIntensity < lowCarbonThreshold ? 'var(--green-glow)' : 'var(--amber-glow)',
              color: activeIntensity < lowCarbonThreshold ? 'var(--green)' : 'var(--amber)'
            }}>
              <Leaf size={20} />
            </div>
            <div className="stat-info">
              <span className="stat-value">{activeIntensity} <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>g/kWh</span></span>
              <span className="stat-label">Grid Carbon Intensity</span>
            </div>
          </div>

          <div className="glass-panel stat-card">
            <div className="stat-icon" style={{ background: 'var(--blue-glow)', color: 'var(--blue)' }}>
              <Terminal size={20} />
            </div>
            <div className="stat-info">
              <span className="stat-value">{runningTasks} / {totalTasks}</span>
              <span className="stat-label">Active / Total Tasks</span>
            </div>
          </div>

          <div className="glass-panel stat-card">
            <div className="stat-icon" style={{ background: 'var(--green-glow)', color: 'var(--green)' }}>
              <ShieldCheck size={20} />
            </div>
            <div className="stat-info">
              <span className="stat-value">
                {totalSavingsGrams >= 1000 ? `${(totalSavingsGrams/1000).toFixed(2)} kg` : `${totalSavingsGrams.toFixed(1)} g`}
              </span>
              <span className="stat-label">Total Carbon Avoided</span>
            </div>
          </div>

          <div className="glass-panel stat-card">
            <div className="stat-icon" style={{ background: 'var(--purple-glow)', color: 'var(--purple)' }}>
              <Sun size={20} />
            </div>
            <div className="stat-info">
              <span className="stat-value">{greenWindows.length}</span>
              <span className="stat-label">Green Windows Available</span>
            </div>
          </div>
        </div>

        {/* Active Tab View Rendering */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
          
          {activeTab === 'dashboard' && (
            <>
              <Dashboard 
                carbonData={carbonData} 
                greenWindows={greenWindows}
                lowCarbonThreshold={lowCarbonThreshold}
              />
              <SavingsCard totalSavingsGrams={totalSavingsGrams} />
            </>
          )}

          {activeTab === 'simulator' && (
            <AgentSimulator
              tasks={tasks}
              logs={logs}
              currentIntensity={activeIntensity}
              baselineIntensity={baselineIntensity}
              peakIntensity={Math.max(baselineIntensity + 150, activeIntensity + 100)}
              greenWindows={greenWindows}
              onAddTask={handleAddTask}
              onDeleteTask={handleDeleteTask}
              onManualTrigger={handleManualTrigger}
              isSimulating={isSimulating}
              simulationSpeed={simulationSpeed}
              onToggleSimulation={() => setIsSimulating(!isSimulating)}
              onSpeedChange={setSimulationSpeed}
              currentOffsetHours={currentOffsetHours}
              onClearLogs={() => setLogs([])}
              onRunOptimization={handleRunOptimization}
            />
          )}

          {activeTab === 'settings' && (
            <Settings
              apiKey={apiKey}
              selectedZone={selectedZone}
              lowCarbonThreshold={lowCarbonThreshold}
              baselineIntensity={baselineIntensity}
              onApiKeyChange={handleApiKeyChange}
              onZoneChange={handleZoneChange}
              onThresholdChange={setLowCarbonThreshold}
              onBaselineChange={setBaselineIntensity}
              onResetStatistics={handleResetStatistics}
              isSimulated={!apiKey}
            />
          )}

        </div>

      </main>
    </div>
  );
}

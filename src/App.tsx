import { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard,
  Terminal,
  Settings as SettingsIcon,
  Leaf,
  Sun,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';
import { Dashboard } from './components/Dashboard';
import { AgentSimulator } from './components/AgentSimulator';
import { SavingsCard } from './components/SavingsCard';
import { Settings } from './components/Settings';

// Hooks
import { useCarbonData } from './hooks/useCarbonData';
import { useTasks } from './hooks/useTasks';
import { useSimulation } from './hooks/useSimulation';

// Types
import type { CarbonResponse } from './services/electricityMaps';

// ============================================================================
// App
// ============================================================================

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'simulator' | 'settings'>('dashboard');

  // ---- Settings (persisted in localStorage) ----
  const [apiKey, setApiKey] = useState<string>(
    () => localStorage.getItem('ecotime_api_key') || ''
  );
  const [selectedZone, setSelectedZone] = useState<string>(
    () => localStorage.getItem('ecotime_zone') || 'US-CA'
  );
  const [lowCarbonThreshold, setLowCarbonThreshold] = useState<number>(180);
  const [baselineIntensity, setBaselineIntensity] = useState<number>(380);

  // ---- Console Logs ----
  const [logs, setLogs] = useState<string[]>([]);
  const addLog = useCallback((message: string) => {
    const ts = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    setLogs(prev => [...prev, `${ts} - ${message}`].slice(-60));
  }, []);

  // ---- Carbon Data (hook) ----
  // We hold offset separately so simulation can advance it
  const [offsetHours, setOffsetHours] = useState(0);

  // carbonData needs to be updatable from both the hook AND the simulation loop
  const [overrideCarbonData, setOverrideCarbonData] = useState<CarbonResponse | null>(null);

  const {
    carbonData: fetchedCarbonData,
    greenWindows,
    loading,
    error: carbonError,
  } = useCarbonData({
    zone: selectedZone,
    apiKey: apiKey || null,
    lowCarbonThreshold,
    offsetHours,
  });

  // Merge: simulation override takes priority over fresh fetch during active sim
  const carbonData = overrideCarbonData ?? fetchedCarbonData;

  // Log connection on first load
  useEffect(() => {
    if (fetchedCarbonData && loading === false) {
      addLog(
        `System: Connected to ${fetchedCarbonData.isSimulated ? 'Simulated Grid' : 'Electricity Maps API'}. ` +
          `Loaded data for ${fetchedCarbonData.zone}.`
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchedCarbonData?.zone]);

  if (carbonError) {
    console.error('[App] Carbon data error:', carbonError);
  }

  // ---- Tasks (hook) ----
  const {
    tasks,
    totalSavingsGrams,
    addTask,
    deleteTask,
    manualTrigger,
    runOptimization,
    addSavings,
    resetAll,
  } = useTasks();

  // ---- Simulation (hook) ----
  const {
    isSimulating,
    simulationSpeed,
    currentOffsetHours,
    toggleSimulation,
    setSimulationSpeed,
    resetOffset,
  } = useSimulation({
    carbonData,
    apiKey: apiKey || null,
    lowCarbonThreshold,
    baselineIntensity,
    onCarbonUpdate: setOverrideCarbonData,
    onTasksUpdate: (updater) => {
      // This is a pass-through; useTasks manages tasks directly via setTasks
      // We bridge it here so useSimulation can mutate task state
      setInternalTasks(updater);
    },
    onSavings: addSavings,
    addLog,
  });

  // Bridge: useSimulation needs to be able to update task list.
  // We pass a setter wrapper that calls the useTasks internal setter indirectly.
  // Since useTasks doesn't expose setTasks, we route updates through updateTaskProgress
  // by using a local state patch approach. For full decoupling we expose an escape hatch:
  const [internalTaskOverride, setInternalTasks] = useState<((prev: typeof tasks) => typeof tasks) | null>(null);

  // Apply any task overrides from the simulation loop
  useEffect(() => {
    // This effect is intentionally minimal; actual task mutation
    // is handled inside useTasks via updateTaskProgress calls.
    // The simulation hook drives logs + savings; task state transitions
    // are handled reactively inside the simulation useEffect.
  }, [internalTaskOverride]);

  // ---- Event Handlers ----

  const handleApiKeyChange = (key: string) => {
    setApiKey(key);
    localStorage.setItem('ecotime_api_key', key);
    setOverrideCarbonData(null); // Clear override to force fresh fetch
    addLog('System: API Key updated. Re-establishing connection...');
  };

  const handleZoneChange = (zone: string) => {
    setSelectedZone(zone);
    localStorage.setItem('ecotime_zone', zone);
    setOffsetHours(0);
    resetOffset();
    setOverrideCarbonData(null);
    addLog(`System: Zone changed to ${zone}. Resetting simulation clock.`);
  };

  const handleResetStatistics = () => {
    resetAll();
    setOffsetHours(0);
    resetOffset();
    setOverrideCarbonData(null);
    addLog('System: Simulation statistics and clock reset. Default tasks restored.');
  };

  const handleRunOptimization = (method: 'greedy' | 'knapsack') => {
    runOptimization(method, greenWindows, baselineIntensity, addLog);
  };

  // Startup logs
  useEffect(() => {
    if (logs.length === 0) {
      addLog('System: EcoTime core initialised.');
      addLog('System: Scanning localised carbon emission offsets...');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Loading State ----
  if (loading || !carbonData) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          gap: '20px',
        }}
      >
        <div
          style={{
            width: '50px',
            height: '50px',
            border: '3px solid var(--border-glass)',
            borderTopColor: 'var(--green)',
            borderRadius: '50%',
            animation: 'pulse 1s infinite',
          }}
        />
        <h3 style={{ fontWeight: '600', color: 'var(--text-secondary)' }}>
          Establishing connection to grid...
        </h3>
      </div>
    );
  }

  // ---- Derived values ----
  const totalTasks = tasks.length;
  const runningTasks = tasks.filter(t => t.status === 'running').length;
  const activeIntensity = carbonData.current.carbonIntensity;

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="app-container">
      {/* Navigation Sidebar */}
      <aside className="sidebar">
        <div className="logo-section">
          <div className="logo-icon-wrapper">
            <Leaf size={22} color="white" />
          </div>
          <span className="logo-text">
            EcoTime <span className="logo-badge">v2.0</span>
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

      {/* Main Content */}
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
              {activeTab === 'dashboard' &&
                'Monitor grid emissions, detect Green Windows, and evaluate savings.'}
              {activeTab === 'simulator' &&
                'Register tasks, run optimization schedulers, and monitor executions.'}
              {activeTab === 'settings' &&
                'Manage Electricity Maps integration, set carbon targets, and resets.'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '20px',
                background: apiKey ? 'var(--green-glow)' : 'rgba(255, 255, 255, 0.02)',
                border: '1px solid ' + (apiKey ? 'var(--green-border)' : 'var(--border-glass)'),
                fontSize: '11px',
                fontWeight: '600',
              }}
            >
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

        {/* Quick Stats */}
        <div className="quick-stats">
          <div className="glass-panel stat-card">
            <div
              className="stat-icon"
              style={{
                background:
                  activeIntensity < lowCarbonThreshold
                    ? 'var(--green-glow)'
                    : 'var(--amber-glow)',
                color:
                  activeIntensity < lowCarbonThreshold ? 'var(--green)' : 'var(--amber)',
              }}
            >
              <Leaf size={20} />
            </div>
            <div className="stat-info">
              <span className="stat-value">
                {activeIntensity}{' '}
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>g/kWh</span>
              </span>
              <span className="stat-label">Grid Carbon Intensity</span>
            </div>
          </div>

          <div className="glass-panel stat-card">
            <div
              className="stat-icon"
              style={{ background: 'var(--blue-glow)', color: 'var(--blue)' }}
            >
              <Terminal size={20} />
            </div>
            <div className="stat-info">
              <span className="stat-value">
                {runningTasks} / {totalTasks}
              </span>
              <span className="stat-label">Active / Total Tasks</span>
            </div>
          </div>

          <div className="glass-panel stat-card">
            <div
              className="stat-icon"
              style={{ background: 'var(--green-glow)', color: 'var(--green)' }}
            >
              <ShieldCheck size={20} />
            </div>
            <div className="stat-info">
              <span className="stat-value">
                {totalSavingsGrams >= 1000
                  ? `${(totalSavingsGrams / 1000).toFixed(2)} kg`
                  : `${totalSavingsGrams.toFixed(1)} g`}
              </span>
              <span className="stat-label">Total Carbon Avoided</span>
            </div>
          </div>

          <div className="glass-panel stat-card">
            <div
              className="stat-icon"
              style={{ background: 'var(--purple-glow)', color: 'var(--purple)' }}
            >
              <Sun size={20} />
            </div>
            <div className="stat-info">
              <span className="stat-value">{greenWindows.length}</span>
              <span className="stat-label">Green Windows Available</span>
            </div>
          </div>
        </div>

        {/* Tab Content */}
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
              onAddTask={addTask}
              onDeleteTask={deleteTask}
              onManualTrigger={manualTrigger}
              isSimulating={isSimulating}
              simulationSpeed={simulationSpeed}
              onToggleSimulation={toggleSimulation}
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

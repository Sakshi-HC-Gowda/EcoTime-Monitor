import { useState, useEffect, useRef } from 'react';
import { Play, Pause, Trash2, Plus, Terminal, Layers, Award, Clock } from 'lucide-react';
import { optimizeKnapsack, getRecommendation } from '../utils/algorithms';
import type { Task, GreenWindow } from '../utils/algorithms';

interface AgentSimulatorProps {
  tasks: Task[];
  logs: string[];
  currentIntensity: number;
  baselineIntensity: number;
  peakIntensity: number;
  greenWindows: GreenWindow[];
  onAddTask: (task: Omit<Task, 'id' | 'status' | 'progress'>) => void;
  onDeleteTask: (id: string) => void;
  onManualTrigger: (id: string, action: 'run' | 'pause' | 'delay') => void;
  isSimulating: boolean;
  simulationSpeed: number;
  onToggleSimulation: () => void;
  onSpeedChange: (speed: number) => void;
  currentOffsetHours: number;
  onClearLogs: () => void;
  onRunOptimization: (method: 'greedy' | 'knapsack') => void;
}

export const AgentSimulator: React.FC<AgentSimulatorProps> = ({
  tasks,
  logs,
  currentIntensity,
  baselineIntensity,
  peakIntensity,
  greenWindows,
  onAddTask,
  onDeleteTask,
  onManualTrigger,
  isSimulating,
  simulationSpeed,
  onToggleSimulation,
  onSpeedChange,
  currentOffsetHours,
  onClearLogs,
  onRunOptimization,
}) => {
  // New task form state
  const [taskName, setTaskName] = useState('');
  const [taskType, setTaskType] = useState<'flexible' | 'non-flexible'>('flexible');
  const [duration, setDuration] = useState(30);
  const [powerDraw, setPowerDraw] = useState(150);
  const [priority, setPriority] = useState(50);
  const [flexibility, setFlexibility] = useState(70);

  const consoleEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll console logs
  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Handle task submissions
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskName.trim()) return;

    onAddTask({
      name: taskName,
      type: taskType,
      duration,
      powerDraw,
      priorityScore: priority,
      flexibilityScore: taskType === 'non-flexible' ? 0 : flexibility,
    });

    // Reset form
    setTaskName('');
  };

  // Pre-fill helper tasks
  const handlePrefillTask = (preset: string) => {
    if (preset === 'backup') {
      setTaskName('Cloud Backup Server');
      setTaskType('flexible');
      setDuration(120);
      setPowerDraw(350);
      setPriority(40);
      setFlexibility(90);
    } else if (preset === 'upload') {
      setTaskName('Raw Dataset Sync');
      setTaskType('flexible');
      setDuration(45);
      setPowerDraw(120);
      setPriority(60);
      setFlexibility(75);
    } else if (preset === 'cicd') {
      setTaskName('CI/CD Pipeline Build');
      setTaskType('flexible');
      setDuration(25);
      setPowerDraw(450);
      setPriority(75);
      setFlexibility(60);
    } else if (preset === 'call') {
      setTaskName('Video Conference');
      setTaskType('non-flexible');
      setDuration(60);
      setPowerDraw(85);
      setPriority(90);
      setFlexibility(0);
    }
  };

  // Knapsack vs Greedy visualizer for the nearest green window
  const activeWindow = greenWindows.find(w => new Date(w.startTime).getTime() >= new Date().getTime() - 5 * 60 * 1000) || greenWindows[0];

  const getKnapsackGreedyComparison = () => {
    if (!activeWindow) return null;

    // Run Knapsack
    const knapsackResult = optimizeKnapsack(tasks, activeWindow, baselineIntensity);

    // Run a manual greedy choice simulation for this window
    const candidates = [...tasks.filter(t => t.type === 'flexible' && t.status !== 'completed')];
    candidates.sort((a, b) => (b.duration * b.powerDraw) - (a.duration * a.powerDraw));
    
    let greedyRemaining = activeWindow.duration;
    const greedySelected: Task[] = [];
    let greedySavedCo2 = 0;

    candidates.forEach(t => {
      if (t.duration <= greedyRemaining) {
        greedySelected.push(t);
        greedyRemaining -= t.duration;
        const hours = t.duration / 60;
        const kW = t.powerDraw / 1000;
        const savingsGrams = hours * kW * Math.max(0, baselineIntensity - activeWindow.avgCarbonIntensity);
        greedySavedCo2 += savingsGrams;
      }
    });

    return {
      window: activeWindow,
      knapsack: {
        tasks: knapsackResult.selectedTasks,
        savings: knapsackResult.totalSavedCo2,
      },
      greedy: {
        tasks: greedySelected,
        savings: greedySavedCo2,
      }
    };
  };

  const comparison = getKnapsackGreedyComparison();

  // Helper formatting for virtual clock
  const getVirtualTimeStr = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + Math.round(currentOffsetHours * 60));
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
      
      {/* Simulation Controller Panel */}
      <div className="glass-panel" style={{ padding: '20px 24px' }}>
        <div className="control-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: isSimulating ? 'var(--green)' : 'var(--amber)',
              boxShadow: isSimulating ? '0 0 10px var(--green)' : '0 0 10px var(--amber)',
              animation: isSimulating ? 'pulse 1.5s infinite' : 'none'
            }} />
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                Simulator Controller
              </h3>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                System clock accelerator for testing scheduling algorithms
              </p>
            </div>
          </div>

          <div className="simulator-controls">
            <div className="simulation-speed-selector">
              <Clock size={14} style={{ color: 'var(--text-secondary)' }} />
              <span>Speed:</span>
              <select 
                value={simulationSpeed} 
                onChange={(e) => onSpeedChange(Number(e.target.value))}
              >
                <option value={1}>1 min/sec (Real)</option>
                <option value={5}>5 min/sec</option>
                <option value={15}>15 min/sec</option>
                <option value={30}>30 min/sec</option>
                <option value={60}>1 hour/sec</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '8px', fontSize: '13px', background: 'rgba(255,255,255,0.02)', padding: '6px 12px', borderRadius: '4px', border: '1px solid var(--border-glass)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Virtual Time:</span>
              <strong style={{ fontFamily: 'var(--font-mono)' }}>{getVirtualTimeStr()}</strong>
            </div>

            <button 
              className={`btn ${isSimulating ? 'btn-rose' : 'btn-primary'}`} 
              onClick={onToggleSimulation}
              style={{ padding: '8px 16px', fontSize: '13px' }}
            >
              {isSimulating ? (
                <>
                  <Pause size={14} /> Pause Sim
                </>
              ) : (
                <>
                  <Play size={14} /> Start Sim
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* Task Creator & Controller */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: '700' }}>Device Agent Task Registry</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Register and control digital workloads on the device</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="glass-panel" style={{ background: 'rgba(255,255,255,0.01)', padding: '16px', border: '1px dashed var(--border-glass)' }}>
            <div className="task-form-grid">
              <div className="input-group">
                <label>Task Name</label>
                <input 
                  type="text" 
                  placeholder="e.g. Cloud Sync" 
                  value={taskName}
                  onChange={(e) => setTaskName(e.target.value)}
                />
              </div>

              <div className="input-group">
                <label>Flexibility Category</label>
                <select value={taskType} onChange={(e) => {
                  const type = e.target.value as 'flexible' | 'non-flexible';
                  setTaskType(type);
                  if (type === 'non-flexible') setFlexibility(0);
                }}>
                  <option value="flexible">Flexible (Can Defer)</option>
                  <option value="non-flexible">Non-Flexible (Run Now)</option>
                </select>
              </div>

              <div className="input-group">
                <label>Duration (mins)</label>
                <input 
                  type="number" 
                  min="5" 
                  max="480" 
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                />
              </div>

              <div className="input-group">
                <label>Power Draw (Watts)</label>
                <input 
                  type="number" 
                  min="10" 
                  max="2000" 
                  value={powerDraw}
                  onChange={(e) => setPowerDraw(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="task-form-grid" style={{ marginTop: '12px' }}>
              <div className="input-group">
                <label>User Priority Score: {priority}/100</label>
                <input 
                  type="range" 
                  min="1" 
                  max="100" 
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                />
              </div>

              {taskType === 'flexible' && (
                <div className="input-group">
                  <label>Flexibility Score: {flexibility}/100</label>
                  <input 
                    type="range" 
                    min="1" 
                    max="100" 
                    value={flexibility}
                    onChange={(e) => setFlexibility(Number(e.target.value))}
                  />
                </div>
              )}
            </div>

            {/* Presets */}
            <div style={{ marginTop: '14px', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 'bold' }}>Presets:</span>
              <button type="button" className="btn" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => handlePrefillTask('backup')}>
                Cloud Backup
              </button>
              <button type="button" className="btn" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => handlePrefillTask('upload')}>
                Dataset Sync
              </button>
              <button type="button" className="btn" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => handlePrefillTask('cicd')}>
                CI/CD Pipeline
              </button>
              <button type="button" className="btn" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => handlePrefillTask('call')}>
                Video Call
              </button>

              <button 
                type="submit" 
                className="btn btn-primary" 
                style={{ marginLeft: 'auto', padding: '6px 14px', fontSize: '12px' }}
                disabled={!taskName.trim()}
              >
                <Plus size={14} /> Add Task
              </button>
            </div>
          </form>

          {/* Schedulers Trigger */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', background: 'rgba(255,255,255,0.015)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              <strong>Scheduler Engine:</strong> Run automatic allocation strategies across the grid.
            </span>
            <button 
              type="button" 
              className="btn btn-primary" 
              style={{ fontSize: '12px', padding: '6px 12px', marginLeft: 'auto' }}
              onClick={() => onRunOptimization('greedy')}
              disabled={tasks.filter(t => t.type === 'flexible' && t.status !== 'completed').length === 0}
            >
              <Layers size={14} /> Run Greedy Allocator
            </button>
            <button 
              type="button" 
              className="btn btn-purple" 
              style={{ fontSize: '12px', padding: '6px 12px' }}
              onClick={() => onRunOptimization('knapsack')}
              disabled={tasks.filter(t => t.type === 'flexible' && t.status !== 'completed').length === 0}
            >
              <Award size={14} /> Run Knapsack Scheduler
            </button>
          </div>

          {/* Tasks List */}
          <div>
            <h4 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-secondary)' }}>Registered Workloads</h4>
            
            {tasks.length === 0 ? (
              <div style={{ padding: '40px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                No active tasks. Register a task above to begin.
              </div>
            ) : (
              <div className="tasks-list">
                {tasks.map(task => {
                  const recommendation = getRecommendation(task, currentIntensity, baselineIntensity, peakIntensity);
                  
                  // Status badge helper
                  let badgeColor = 'var(--text-secondary)';
                  if (task.status === 'running') {
                    badgeColor = 'var(--green)';
                  } else if (task.status === 'paused') {
                    badgeColor = 'var(--amber)';
                  } else if (task.status === 'delayed') {
                    badgeColor = 'var(--blue)';
                  } else if (task.status === 'completed') {
                    badgeColor = 'var(--text-muted)';
                  }

                  return (
                    <div key={task.id} className="task-item">
                      <div className="task-identity">
                        <div className="task-name-wrapper">
                          <span className="task-name">{task.name}</span>
                          <span className={`task-type-badge ${task.type}`}>
                            {task.type}
                          </span>
                        </div>
                        <div className="task-meta-detail">
                          Duration: {task.duration} min | Power: {task.powerDraw}W
                        </div>
                      </div>

                      <div className="task-scores">
                        <div className="score-badge" title="Flexibility (0-100)">
                          Flex: <span>{task.flexibilityScore}</span>
                        </div>
                        <div className="score-badge" title="User Priority (0-100)">
                          Prio: <span>{task.priorityScore}</span>
                        </div>
                        <div className="score-badge" style={{ color: 'var(--purple)' }} title="EcoScore = 0.5*Carbon + 0.3*Flex + 0.2*Prio">
                          Eco: <span>{recommendation.score}</span>
                        </div>
                      </div>

                      <div className="task-status-container">
                        <div className="task-status-row">
                          <span style={{
                            display: 'inline-block',
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: badgeColor,
                            boxShadow: task.status === 'running' ? '0 0 8px var(--green)' : 'none'
                          }} />
                          <span style={{ color: badgeColor, textTransform: 'capitalize' }}>
                            {task.status}
                          </span>
                        </div>
                        
                        <div className="task-progress-bar">
                          <div className="task-progress-fill" style={{ width: `${task.progress}%` }} />
                        </div>
                      </div>

                      <div style={{ fontSize: '11px', maxWidth: '140px', color: 'var(--text-secondary)', lineHeight: '1.3' }}>
                        <strong>Rec:</strong> {recommendation.recommendation}<br />
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{recommendation.reason.slice(0, 45)}...</span>
                      </div>

                      <div className="task-actions">
                        {task.status !== 'completed' && (
                          <>
                            {task.status !== 'running' ? (
                              <button 
                                className="icon-btn" 
                                title="Manual Execute Now"
                                onClick={() => onManualTrigger(task.id, 'run')}
                              >
                                <Play size={12} fill="var(--text-secondary)" />
                              </button>
                            ) : (
                              <button 
                                className="icon-btn" 
                                title="Manual Pause"
                                onClick={() => onManualTrigger(task.id, 'pause')}
                              >
                                <Pause size={12} fill="var(--text-secondary)" />
                              </button>
                            )}
                          </>
                        )}
                        <button 
                          className="icon-btn delete-btn" 
                          title="Delete Task"
                          onClick={() => onDeleteTask(task.id)}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Console logs & Knapsack visualizer */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
          
          {/* 0/1 Knapsack vs Greedy Visualizer */}
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={20} style={{ color: 'var(--purple)' }} />
                0/1 Knapsack Optimization
              </h3>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Comparing allocation algorithms for the upcoming Green Window
              </p>
            </div>

            {comparison && comparison.window ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ fontSize: '12px', background: 'rgba(168,85,247,0.02)', padding: '10px', borderRadius: '6px', border: '1px solid var(--purple-border)', color: 'var(--text-secondary)' }}>
                  <strong>Next window capacity:</strong> {comparison.window.duration} minutes at {comparison.window.avgCarbonIntensity} gCO₂e/kWh average intensity (Savings: ~{comparison.window.carbonSavingPercent.toFixed(0)}% vs baseline).
                </div>

                <div className="compare-badges">
                  <div className="compare-badge knapsack">
                    <span className="compare-badge-title">0/1 Knapsack (Optimal)</span>
                    <span className="compare-badge-value" style={{ color: 'var(--green)' }}>
                      {comparison.knapsack.savings.toFixed(1)}g CO₂
                    </span>
                    <span className="compare-badge-desc">
                      Selected {comparison.knapsack.tasks.length} task(s)
                    </span>
                  </div>

                  <div className="compare-badge greedy">
                    <span className="compare-badge-title">Greedy Algorithm</span>
                    <span className="compare-badge-value" style={{ color: 'var(--text-secondary)' }}>
                      {comparison.greedy.savings.toFixed(1)}g CO₂
                    </span>
                    <span className="compare-badge-desc">
                      Selected {comparison.greedy.tasks.length} task(s)
                    </span>
                  </div>
                </div>

                {/* Mathematical explanation */}
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4', padding: '6px' }}>
                  {comparison.knapsack.savings > comparison.greedy.savings ? (
                    <span style={{ color: 'var(--green)' }}>
                      🏆 <strong>Knapsack is {((comparison.knapsack.savings - comparison.greedy.savings) / Math.max(1, comparison.greedy.savings) * 100).toFixed(0)}% more efficient!</strong> Unlike the greedy method which fills based on size, Knapsack solves the mathematical 0/1 optimization problem to fit the highest-value combo in the {comparison.window.duration} min slot.
                    </span>
                  ) : (
                    <span>
                      💡 Knapsack and Greedy selected equivalent packages due to limited queue density. Add more tasks of varying durations (e.g., 20m, 40m, 60m) to see the Knapsack benefit.
                    </span>
                  )}
                </div>

                {/* Selected tasks display */}
                <div style={{ display: 'flex', gap: '10px', fontSize: '11px' }}>
                  <div style={{ flex: 1 }}>
                    <strong style={{ color: 'var(--purple)' }}>Knapsack Set:</strong>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '4px' }}>
                      {comparison.knapsack.tasks.length === 0 ? 'None selected' : comparison.knapsack.tasks.map(t => (
                        <div key={t.id} style={{ background: 'rgba(255,255,255,0.02)', padding: '3px 6px', borderRadius: '4px' }}>
                          • {t.name} ({t.duration}m, {t.powerDraw}W)
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ flex: 1 }}>
                    <strong>Greedy Set:</strong>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '4px' }}>
                      {comparison.greedy.tasks.length === 0 ? 'None selected' : comparison.greedy.tasks.map(t => (
                        <div key={t.id} style={{ background: 'rgba(255,255,255,0.02)', padding: '3px 6px', borderRadius: '4px' }}>
                          • {t.name} ({t.duration}m, {t.powerDraw}W)
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '15px 0', textAlign: 'center' }}>
                Create flexible tasks and wait for forecast detection to trigger knapsack comparison.
              </div>
            )}
          </div>

          {/* Console logs */}
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', flex: '1', minHeight: '220px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Terminal size={18} style={{ color: '#38bdf8' }} />
                Device Agent Live Log Console
              </h3>
              <button 
                type="button" 
                className="btn" 
                style={{ padding: '2px 8px', fontSize: '10px', height: '22px' }}
                onClick={onClearLogs}
              >
                Clear
              </button>
            </div>

            <div className="console-panel">
              {logs.map((log, index) => {
                const parts = log.split(' - ');
                const timestamp = parts[0];
                const content = parts[1] || log;
                
                // Color codes
                let logClass = 'console-info';
                if (content.includes('OPTIMAL') || content.includes('Resuming') || content.includes('Execute') || content.includes('Completed') || content.includes('savings')) {
                  logClass = 'console-success';
                } else if (content.includes('HIGH') || content.includes('Paused') || content.includes('Delaying') || content.includes('threshold')) {
                  logClass = 'console-warning';
                } else if (content.includes('error') || content.includes('Failed')) {
                  logClass = 'console-error';
                }

                return (
                  <div key={index} className="console-line">
                    <span className="console-timestamp">{timestamp}</span>
                    <span className={logClass}>{content}</span>
                  </div>
                );
              })}
              <div ref={consoleEndRef} />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

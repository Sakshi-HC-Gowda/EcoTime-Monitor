import { Key, Settings as SettingsIcon, CheckCircle2, RotateCcw, AlertTriangle } from 'lucide-react';
import { GRID_ZONES } from '../services/electricityMaps';

interface SettingsProps {
  apiKey: string;
  selectedZone: string;
  lowCarbonThreshold: number;
  baselineIntensity: number;
  onApiKeyChange: (key: string) => void;
  onZoneChange: (zone: string) => void;
  onThresholdChange: (threshold: number) => void;
  onBaselineChange: (baseline: number) => void;
  onResetStatistics: () => void;
  isSimulated: boolean;
}

export const Settings: React.FC<SettingsProps> = ({
  apiKey,
  selectedZone,
  lowCarbonThreshold,
  baselineIntensity,
  onApiKeyChange,
  onZoneChange,
  onThresholdChange,
  onBaselineChange,
  onResetStatistics,
  isSimulated,
}) => {
  const currentZone = GRID_ZONES.find(z => z.id === selectedZone) || GRID_ZONES[0];

  return (
    <div className="glass-panel settings-panel" style={{ maxWidth: '800px', margin: '0 auto' }}>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
        <div style={{
          width: '38px',
          height: '38px',
          borderRadius: '10px',
          background: 'var(--blue-glow)',
          border: '1px solid var(--blue-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--blue)'
        }}>
          <SettingsIcon size={20} />
        </div>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: '700' }}>Platform Configuration Settings</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Configure connection, threshold standards, and simulator states</p>
        </div>
      </div>

      {/* Electricity Maps Connection */}
      <div className="settings-group">
        <h3 className="settings-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Key size={18} style={{ color: 'var(--blue)' }} />
          Electricity Maps API Connection
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            EcoTime can communicate with the live Electricity Maps API to fetch real, current carbon intensity data.
            If left empty, the platform operates in <strong>Simulation Mode</strong> using high-fidelity mathematical models.
          </p>

          <div className="input-group">
            <label>API Key / Authentication Token</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="password"
                placeholder="Enter Electricity Maps API auth-token..."
                value={apiKey}
                onChange={(e) => onApiKeyChange(e.target.value)}
                style={{ flex: 1, fontFamily: 'monospace' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderRadius: '8px', background: isSimulated ? 'var(--amber-glow)' : 'var(--green-glow)', border: isSimulated ? '1px solid var(--amber-border)' : '1px solid var(--green-border)' }}>
            {isSimulated ? (
              <>
                <AlertTriangle size={18} style={{ color: 'var(--amber)' }} />
                <span style={{ fontSize: '12px', color: 'var(--text-primary)' }}>
                  <strong>Simulation Mode Active:</strong> Running off regional generation cycle models. No API Key required.
                </span>
              </>
            ) : (
              <>
                <CheckCircle2 size={18} style={{ color: 'var(--green)' }} />
                <span style={{ fontSize: '12px', color: 'var(--text-primary)' }}>
                  <strong>Live Connection Ready:</strong> Electricity Maps API endpoints enabled. Running off real-world grid data.
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Region / Grid Zone Selector */}
      <div className="settings-group">
        <h3 className="settings-title">Grid Region Selection</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Select the carbon grid zone that represents your computing environment. Different zones feature distinct generation profiles:
          </p>

          <div className="input-group">
            <label>Active Region</label>
            <select value={selectedZone} onChange={(e) => onZoneChange(e.target.value)}>
              {GRID_ZONES.map(z => (
                <option key={z.id} value={z.id}>
                  {z.name} ({z.id}) - {z.type.toUpperCase()}-dominated grid
                </option>
              ))}
            </select>
          </div>

          {/* Regional details card */}
          <div style={{ background: 'rgba(255,255,255,0.015)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-glass)', fontSize: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Typical Grid Base Load:</span><br />
              <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{currentZone.baseIntensity} gCO₂e/kWh</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Generation Strategy Profile:</span><br />
              <strong style={{ fontSize: '14px', color: 'var(--text-primary)', textTransform: 'capitalize' }}>{currentZone.type} generation</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Jitter / Noise Factor:</span><br />
              <strong>±{currentZone.noise} g/kWh</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Daily Variance Amplitude:</span><br />
              <strong>{currentZone.amplitude} g/kWh</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Optimization Parameters */}
      <div className="settings-group">
        <h3 className="settings-title">Optimization Engine Parameters</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          <div className="input-group">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <label>Low Carbon Threshold: <strong>{lowCarbonThreshold} gCO₂e/kWh</strong></label>
              <span style={{ fontSize: '11px', color: 'var(--green)', fontWeight: 'bold' }}>Under this value is Green</span>
            </div>
            <input
              type="range"
              min="30"
              max="500"
              step="5"
              value={lowCarbonThreshold}
              onChange={(e) => onThresholdChange(Number(e.target.value))}
            />
            <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Defines the boundary below which the scheduler classifies a time slot as a "Green Window".
            </p>
          </div>

          <div className="input-group">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <label>Baseline Grid Intensity: <strong>{baselineIntensity} gCO₂e/kWh</strong></label>
              <span style={{ fontSize: '11px', color: 'var(--rose)', fontWeight: 'bold' }}>Dirty Peak reference</span>
            </div>
            <input
              type="range"
              min="100"
              max="800"
              step="10"
              value={baselineIntensity}
              onChange={(e) => onBaselineChange(Number(e.target.value))}
            />
            <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Used to calculate relative carbon savings. Represents the average carbon intensity of standard computing peak grid (e.g. running jobs immediately with no carbon awareness).
            </p>
          </div>

        </div>
      </div>

      {/* Statistics and State Resets */}
      <div className="settings-group" style={{ paddingBottom: '0' }}>
        <h3 className="settings-title">Maintenance & Simulation Reset</h3>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
          <div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Reset total carbon savings, clear active task registers, and restore default tasks checklist.
            </p>
          </div>
          <button 
            type="button" 
            className="btn btn-rose" 
            style={{ fontSize: '12px', padding: '8px 16px' }}
            onClick={onResetStatistics}
          >
            <RotateCcw size={14} /> Reset Simulation Statistics
          </button>
        </div>
      </div>

    </div>
  );
};

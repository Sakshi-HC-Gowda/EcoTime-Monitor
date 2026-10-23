import { useState, useCallback } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Settings as SettingsComponent } from '@/components/Settings';
import { useZone } from '@/app/ZoneProvider';

export function SettingsPage() {
  const { selectedZone, setSelectedZone } = useZone();

  // Settings persisted in localStorage
  const [apiKey, setApiKey] = useState<string>(
    () => localStorage.getItem('ecotime_api_key') || ''
  );
  const [lowCarbonThreshold, setLowCarbonThreshold] = useState<number>(() => {
    const stored = localStorage.getItem('ecotime_threshold');
    return stored ? Number(stored) : 180;
  });
  const [baselineIntensity, setBaselineIntensity] = useState<number>(() => {
    const stored = localStorage.getItem('ecotime_baseline');
    return stored ? Number(stored) : 380;
  });

  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const showFeedback = useCallback((msg: string) => {
    setFeedbackMessage(msg);
    const timer = setTimeout(() => setFeedbackMessage(null), 3500);
    return () => clearTimeout(timer);
  }, []);

  const handleApiKeyChange = (key: string) => {
    setApiKey(key);
    localStorage.setItem('ecotime_api_key', key);
    showFeedback(key ? 'Electricity Maps API Key updated.' : 'Switched to Simulation Sandbox mode.');
  };

  const handleZoneChange = (zone: string) => {
    setSelectedZone(zone);
    showFeedback(`Grid zone changed to ${zone}.`);
  };

  const handleThresholdChange = (threshold: number) => {
    setLowCarbonThreshold(threshold);
    localStorage.setItem('ecotime_threshold', String(threshold));
  };

  const handleBaselineChange = (baseline: number) => {
    setBaselineIntensity(baseline);
    localStorage.setItem('ecotime_baseline', String(baseline));
  };

  const handleResetStatistics = () => {
    setLowCarbonThreshold(180);
    setBaselineIntensity(380);
    localStorage.removeItem('ecotime_threshold');
    localStorage.removeItem('ecotime_baseline');
    showFeedback('Simulation statistics and thresholds reset to defaults.');
  };

  return (
    <div className="page-shell-narrow page-stack">
      {/* Page Header */}
      <div>
        <h1 className="page-header-title heading-row">
          Settings
          <span className="ds-badge bg-white/[0.06] text-slate-400">
            Preferences
          </span>
        </h1>
        <p className="page-header-subtitle">
          Configure Electricity Maps API connectivity, regional grid parameters, and optimization targets.
        </p>
      </div>

      {feedbackMessage && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-medium">
          <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" />
          <span>{feedbackMessage}</span>
        </div>
      )}

      {/* Main Settings Panel */}
      <div className="section-stack">
        <SettingsComponent
          apiKey={apiKey}
          selectedZone={selectedZone || 'US-CA'}
          lowCarbonThreshold={lowCarbonThreshold}
          baselineIntensity={baselineIntensity}
          onApiKeyChange={handleApiKeyChange}
          onZoneChange={handleZoneChange}
          onThresholdChange={handleThresholdChange}
          onBaselineChange={handleBaselineChange}
          onResetStatistics={handleResetStatistics}
          isSimulated={!apiKey}
        />
      </div>
    </div>
  );
}

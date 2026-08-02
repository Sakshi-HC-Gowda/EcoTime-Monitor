import { Key, Globe, Sliders, RotateCcw } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';

export function SettingsPage() {
  return (
    <div className="page-shell-narrow page-stack">
      <div>
        <h1 className="page-header-title heading-row">
          Settings
          <span className="ds-badge bg-white/[0.06] text-slate-400">
            Configuration
          </span>
        </h1>
        <p className="page-header-subtitle">Configure grid zones, API keys, and platform preferences.</p>
      </div>

      {/* Placeholder setting sections */}
      <div className="section-stack">
        {[
          { icon: Key,      label: 'API Configuration',   desc: 'Electricity Maps API key and authentication settings.',  color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20' },
          { icon: Globe,    label: 'Grid Zone',            desc: 'Select your electricity grid region for live data.',       color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20' },
          { icon: Sliders,  label: 'Carbon Thresholds',    desc: 'Set low-carbon and baseline intensity values.',            color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
          { icon: RotateCcw, label: 'Reset & Restore',    desc: 'Reset simulation data, tasks, and statistics.',            color: 'text-rose-400',   bg: 'bg-rose-500/10 border-rose-500/20' },
        ].map(({ icon: Icon, label, desc, color, bg }) => (
          <GlassCard key={label} variant="elevated" className="flex items-center gap-4 cursor-not-allowed opacity-70">
            <div className={`ds-icon-box ${bg} ${color}`}>
              <Icon className="ds-icon-lg" />
            </div>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-white">{label}</p>
              <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
            </div>
            <span className="ml-auto text-[10px] font-bold text-slate-600 uppercase tracking-widest flex-shrink-0">Phase 12</span>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}

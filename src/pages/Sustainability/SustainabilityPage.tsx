import { Leaf, Sprout, TreePine, Wind } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';

export function SustainabilityPage() {
  return (
    <div className="page-shell page-stack">
      <div>
        <h1 className="page-header-title heading-row">
          Sustainability
          <span className="ds-badge bg-green-500/10 text-green-400 border-green-500/20">
            Impact Tracker
          </span>
        </h1>
        <p className="page-header-subtitle">Track cumulative carbon savings and environmental impact metrics.</p>
      </div>

      {/* Placeholder metric cards */}
      <div className="card-grid card-grid-sm-3">
        {[
          { icon: Leaf, label: 'Total Carbon Avoided', value: '4.82 kg', color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' },
          { icon: TreePine, label: 'Trees Equivalent', value: '0.44', color: 'text-teal-400', bg: 'bg-teal-500/10 border-teal-500/20' },
          { icon: Wind, label: 'Clean kWh Scheduled', value: '26.8', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
        ].map(({ icon: Icon, label, value, color, bg }) => (
          <GlassCard key={label} variant="elevated">
            <div className={`ds-icon-box mb-4 ${bg} ${color}`}>
              <Icon className="ds-icon-lg" />
            </div>
            <p className="label-text mb-1">{label}</p>
            <p className="text-2xl font-extrabold text-white tracking-tight">{value}</p>
          </GlassCard>
        ))}
      </div>

      <GlassCard padding="lg" className="text-center py-12 flex flex-col items-center">
        <div className="w-12 h-12 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center mb-5">
          <Sprout className="w-5 h-5 text-green-400" />
        </div>
        <h2 className="text-lg font-semibold text-white mb-2">Full Impact Dashboard Coming Soon</h2>
        <p className="text-sm text-slate-400 max-w-sm leading-relaxed">
          Detailed environmental impact metrics, historical trends, and sustainability reporting are being built in Phase 11.
        </p>
      </GlassCard>
    </div>
  );
}

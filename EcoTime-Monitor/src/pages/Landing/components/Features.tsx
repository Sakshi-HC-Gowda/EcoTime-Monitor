import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, TrendingUp, Wind, Zap } from 'lucide-react';
import { EcoScoreGauge } from '@/features/optimization/components/EcoScoreGauge';

const features = [
  {
    id: 'telemetry',
    icon: Activity,
    title: 'See Grid Conditions',
    description: 'Know when your region is cleaner, dirtier, or changing quickly.',
    color: 'from-green-500/20 to-emerald-500/10',
    iconColor: 'text-green-400',
    visual: () => (
      <div className="flex h-full flex-col items-center justify-center text-center">
        <Activity className="mb-6 h-14 w-14 text-green-400 opacity-80" />
        <div className="text-3xl font-black text-white md:text-4xl">
          124 <span className="text-base font-semibold text-slate-400 md:text-lg">gCO2/kWh</span>
        </div>
        <p className="mt-3 font-mono text-sm font-semibold tracking-wide text-green-400">LIVE GRID</p>
      </div>
    ),
  },
  {
    id: 'forecast',
    icon: TrendingUp,
    title: 'Plan Ahead',
    description: 'Preview cleaner execution windows before workloads begin.',
    color: 'from-cyan-500/20 to-blue-500/10',
    iconColor: 'text-cyan-400',
    visual: () => (
      <div className="flex h-full w-full flex-col items-center justify-center px-2 sm:px-8">
        <div className="flex h-32 w-full items-end justify-between gap-2">
          {[80, 60, 40, 30, 45, 70, 90].map((h, i) => (
            <motion.div
              key={i}
              initial={{ height: 0 }}
              animate={{ height: `${h}%` }}
              transition={{ delay: i * 0.08, duration: 0.4 }}
              className="w-full rounded-t-md bg-cyan-500/40"
            />
          ))}
        </div>
        <div className="mt-4 flex w-full justify-between border-t border-cyan-500/30 pt-3 font-mono text-xs text-slate-400">
          <span>NOW</span>
          <span>+18H</span>
          <span>+36H</span>
        </div>
      </div>
    ),
  },
  {
    id: 'windows',
    icon: Wind,
    title: 'Find Green Windows',
    description: 'Spot the best times to run flexible work with lower impact.',
    color: 'from-teal-500/20 to-emerald-500/10',
    iconColor: 'text-teal-400',
    visual: () => (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 px-2 sm:px-8">
        <div className="flex w-full items-center justify-between gap-4 rounded-xl border border-teal-500/20 bg-teal-500/10 p-4">
          <span className="font-mono text-sm text-teal-400">14:00 - 16:30</span>
          <span className="font-bold text-white">110g</span>
        </div>
        <div className="flex w-full items-center justify-between gap-4 rounded-xl border border-white/[0.05] bg-white/[0.02] p-4 opacity-60">
          <span className="font-mono text-sm text-slate-400">21:00 - 23:00</span>
          <span className="font-bold text-white">145g</span>
        </div>
      </div>
    ),
  },
  {
    id: 'optimization',
    icon: Zap,
    title: 'Protect Deadlines',
    description: 'Balance carbon savings with duration, urgency, and flexibility.',
    color: 'from-amber-500/20 to-orange-500/10',
    iconColor: 'text-amber-400',
    visual: () => (
      <div className="flex h-full flex-col items-center justify-center">
        <EcoScoreGauge score={85} size={200} />
      </div>
    ),
  },
];

export function Features() {
  const [activeTab, setActiveTab] = useState(features[0].id);
  const currentFeature = features.find((f) => f.id === activeTab) || features[0];

  return (
    <section id="features" className="landing-section relative z-10 border-t border-white/[0.06]">
      <div className="landing-container">
        <div className="mx-auto mb-12 max-w-3xl text-center md:mb-16">
          <p className="section-eyebrow">Features</p>
          <h2 className="section-title text-balance">Everything teams need to move work into cleaner hours.</h2>
        </div>

        <div className="content-grid content-grid-12 lg:gap-[var(--space-12)]">
          <div className="space-y-3 lg:col-span-5">
            {features.map((feature) => {
              const Icon = feature.icon;
              const isActive = activeTab === feature.id;

              return (
                <button
                  key={feature.id}
                  onClick={() => setActiveTab(feature.id)}
                  className={`ds-card ds-card-hover flex min-h-[104px] w-full items-start gap-4 p-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500/40 ${
                    isActive
                      ? 'border-white/[0.12] bg-slate-900/60 shadow-lg shadow-black/30'
                      : 'border-transparent bg-transparent hover:bg-white/[0.03]'
                  }`}
                >
                  <div
                    className={`ds-icon-box h-11 w-11 transition-colors ${
                      isActive ? `bg-gradient-to-br ${feature.color}` : 'bg-white/[0.05]'
                    }`}
                  >
                    <Icon className={`h-5 w-5 ${isActive ? feature.iconColor : 'text-slate-400'}`} />
                  </div>
                  <div className="min-w-0 pt-0.5">
                    <span className={`block text-base font-bold leading-snug transition-colors md:text-lg ${isActive ? 'text-white' : 'text-slate-400'}`}>
                      {feature.title}
                    </span>
                    {isActive && (
                      <p className="mt-1 text-sm leading-6 text-slate-400">{feature.description}</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="lg:col-span-7">
            <div className="ds-card relative flex min-h-[320px] w-full items-center justify-center overflow-hidden bg-slate-900/40 p-6 backdrop-blur-xl md:min-h-[400px] md:p-8">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentFeature.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                  className="relative h-full w-full"
                >
                  <div
                    className={`pointer-events-none absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 bg-gradient-to-br opacity-15 blur-[80px] ${currentFeature.color}`}
                  />
                  <div className="relative z-10 h-full w-full">{currentFeature.visual()}</div>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

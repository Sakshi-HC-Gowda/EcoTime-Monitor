import { motion } from 'framer-motion';
import {
  Activity,
  ArrowRight,
  CalendarClock,
  CheckCircle,
  Leaf,
  TrendingUp,
  Wind,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

const benefits = [
  'Lower emissions without slowing teams down',
  'Clear scheduling decisions for flexible work',
  'One dashboard for carbon, timing, and impact',
];

const previewMetrics = [
  { label: 'Current Carbon', value: '124', unit: 'gCO2/kWh', icon: Activity, color: 'text-green-400' },
  { label: 'Next Window', value: '14:00', unit: 'Today', icon: Wind, color: 'text-teal-400' },
  { label: 'Saved', value: '4.82', unit: 'kg CO2', icon: Leaf, color: 'text-emerald-400' },
];

export function DashboardPreview() {
  return (
    <section id="dashboard-preview" className="landing-section relative z-10 border-t border-white/[0.06] bg-slate-950/60">
      <div className="landing-container">
        <div className="content-grid content-grid-12 items-center gap-[var(--space-12)] lg:gap-[var(--space-16)]">
          <div className="lg:col-span-5">
            <p className="section-eyebrow text-teal-400">Dashboard Preview</p>
            <h2 className="section-title text-balance">A focused view of when to run, wait, and save.</h2>
            <p className="mt-4 text-base leading-8 text-slate-400 md:text-lg">
              EcoTime turns shifting grid conditions into clear workload actions, so carbon-aware scheduling feels like normal operations.
            </p>

            <div className="mt-8 space-y-3">
              {benefits.map((benefit) => (
                <div key={benefit} className="flex items-start gap-3">
                  <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-400" />
                  <span className="text-sm leading-6 text-slate-300 md:text-base">{benefit}</span>
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button to="/dashboard" iconRight={<ArrowRight className="h-5 w-5" />}>
                Launch Dashboard
              </Button>
              <Button href="#features" variant="secondary">
                Explore Features
              </Button>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45 }}
            className="lg:col-span-7"
          >
            <div className="ds-card overflow-hidden bg-slate-900/60 shadow-2xl shadow-black/30 backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
                <div>
                  <p className="text-sm font-bold text-white">Carbon Dashboard</p>
                  <p className="text-xs text-slate-500">Live workload summary</p>
                </div>
                <span className="ds-badge border-green-500/20 bg-green-500/10 text-green-400">
                  Live
                </span>
              </div>

              <div className="card-grid card-grid-sm-3 p-4">
                {previewMetrics.map((metric) => {
                  const Icon = metric.icon;
                  return (
                    <div key={metric.label} className="ds-card ds-card-pad-sm min-h-[120px] bg-white/[0.03]">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <p className="label-text">{metric.label}</p>
                        <Icon className={`h-4 w-4 ${metric.color}`} />
                      </div>
                      <div className="flex flex-wrap items-baseline gap-1.5">
                        <span className="text-2xl font-extrabold leading-none text-white">{metric.value}</span>
                        <span className="text-xs font-medium text-slate-400">{metric.unit}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="content-grid content-grid-12 p-4 pt-0">
                <div className="ds-card ds-card-pad-sm bg-white/[0.03] lg:col-span-8">
                  <div className="mb-5 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-purple-400" />
                      <p className="text-sm font-bold text-white">Carbon Forecast</p>
                    </div>
                    <span className="text-xs font-semibold text-purple-300">Next 12 hours</span>
                  </div>
                  <div className="flex h-36 items-end gap-2">
                    {[72, 56, 42, 34, 48, 64, 86, 70, 52].map((height, index) => (
                      <div key={index} className="flex flex-1 items-end">
                        <div className="w-full rounded-t bg-purple-400/45" style={{ height: `${height}%` }} />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="ds-card ds-card-pad-sm border-teal-500/20 bg-teal-500/[0.06] lg:col-span-4">
                  <div className="mb-5 flex items-center gap-2">
                    <CalendarClock className="h-4 w-4 text-teal-400" />
                    <p className="text-sm font-bold text-white">Recommended Window</p>
                  </div>
                  <p className="text-2xl font-black text-teal-300">14:00</p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Run flexible workloads during lower-carbon grid hours.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

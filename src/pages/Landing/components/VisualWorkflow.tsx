import { motion } from 'framer-motion';
import { Radio, BarChart2, CalendarClock, CheckCircle } from 'lucide-react';

const workflowSteps = [
  {
    id: 1,
    title: 'Detect the Problem',
    icon: Radio,
    metric: 'High',
    label: 'Dirty grid periods',
    color: 'from-blue-500/20 to-cyan-500/10',
    iconColor: 'text-blue-400',
  },
  {
    id: 2,
    title: 'Identify Better Hours',
    icon: BarChart2,
    metric: '36h',
    label: 'Planning visibility',
    color: 'from-purple-500/20 to-pink-500/10',
    iconColor: 'text-purple-400',
  },
  {
    id: 3,
    title: 'Schedule Flexible Work',
    icon: CalendarClock,
    metric: 'Smart',
    label: 'Deadline-aware timing',
    color: 'from-amber-500/20 to-orange-500/10',
    iconColor: 'text-amber-400',
  },
  {
    id: 4,
    title: 'Measure the Benefit',
    icon: CheckCircle,
    metric: '34%',
    label: 'Average reduction',
    color: 'from-green-500/20 to-emerald-500/10',
    iconColor: 'text-green-400',
  },
];

export function VisualWorkflow() {
  return (
    <section id="workflow" className="landing-section relative z-10 border-t border-white/[0.06] bg-slate-950/40">
      <div className="landing-container">
        <div className="mx-auto mb-12 max-w-3xl text-center md:mb-16">
          <p className="section-eyebrow text-emerald-400">Solution</p>
          <h2 className="section-title text-balance">Turn carbon volatility into an operational advantage.</h2>
          <p className="mt-4 text-base leading-8 text-slate-400 md:text-lg">
            EcoTime helps teams avoid high-carbon hours without turning scheduling into manual coordination work.
          </p>
        </div>

        <div className="relative">
          <div className="absolute left-[8%] right-[8%] top-[72px] hidden h-px bg-white/[0.06] lg:block" />
          <div className="absolute left-[8%] right-[8%] top-[72px] hidden h-px overflow-hidden lg:block">
            <motion.div
              className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-green-500"
              initial={{ width: '0%' }}
              whileInView={{ width: '100%' }}
              viewport={{ once: true }}
              transition={{ duration: 1.2, ease: 'easeInOut' }}
            />
          </div>

          <div className="card-grid card-grid-sm-2 card-grid-lg-4 relative z-10 lg:gap-[var(--space-8)]">
            {workflowSteps.map((step, idx) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: idx * 0.1 }}
                  className="ds-card ds-card-hover group relative flex h-full flex-col items-center bg-slate-900/50 p-6 text-center backdrop-blur-xl"
                >
                  <div
                    className={`ds-icon-box mb-6 h-16 w-16 bg-gradient-to-br transition-transform duration-[var(--duration-normal)] group-hover:scale-105 ${step.color}`}
                  >
                    <Icon className={`h-7 w-7 ${step.iconColor}`} />
                  </div>

                  <h3 className="mb-4 text-base font-bold leading-snug text-white md:text-lg">{step.title}</h3>

                  <div className="ds-card ds-card-pad-sm mt-auto w-full">
                    <div className={`mb-1 text-2xl font-black ${step.iconColor}`}>{step.metric}</div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{step.label}</div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

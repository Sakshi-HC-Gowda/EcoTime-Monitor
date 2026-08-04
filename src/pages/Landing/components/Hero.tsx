import { motion } from 'framer-motion';
import { ArrowRight, Play, Shield, Clock, Activity, Zap } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function Hero() {
  return (
    <section className="relative w-full min-h-screen pt-24 pb-16 md:pt-28 md:pb-20 lg:pt-32 lg:pb-24 overflow-hidden flex items-center">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-12 left-1/2 -translate-x-1/2 w-[760px] max-w-[90vw] h-[420px] bg-gradient-to-tr from-green-500/15 via-emerald-500/8 to-cyan-500/10 blur-[110px] rounded-full animate-aurora" />
      </div>

      <div className="landing-container relative z-10">
        <div className="text-center max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="ds-badge mb-6 bg-white/[0.04] text-xs font-medium text-green-400 backdrop-blur-md md:text-sm"
          >
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Carbon-aware scheduling for modern teams
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.08 }}
            className="text-[clamp(2.5rem,7vw,4.75rem)] font-extrabold tracking-tight text-white leading-[1.05] mb-6 text-balance"
          >
            Schedule Smarter.{' '}
            <span className="bg-gradient-to-r from-green-400 via-emerald-300 to-teal-200 bg-clip-text text-transparent">
              Emit Less.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.16 }}
            className="text-base md:text-lg lg:text-xl text-slate-300 font-normal leading-8 max-w-2xl mx-auto mb-8 md:mb-10"
          >
            EcoTime helps you schdeule digital activities during cleaner energy periods to reduce carbon emissions without missing deadlines          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.24 }}
            className="mb-10 flex flex-col items-stretch justify-center gap-[var(--space-4)] sm:flex-row sm:items-center md:mb-12 md:gap-[var(--space-5)]"
          >
            <Button
              to="/dashboard"
              fullWidth
              className="sm:w-auto"
              iconRight={<ArrowRight className="w-5 h-5" />}
            >
              Get Started
            </Button>

            <Button
              href="#workflow"
              variant="secondary"
              fullWidth
              className="sm:w-auto"
              iconLeft={<Play className="w-4 h-4 text-green-400 fill-green-400" />}
            >
              Watch Demo
            </Button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.32 }}
            className="card-grid card-grid-sm-2 card-grid-lg-4 rounded-[var(--radius-card)] border border-white/[0.05] bg-slate-900/28 p-[var(--card-padding-sm)] text-left backdrop-blur-2xl md:p-[var(--card-padding-md)]"
          >
          </motion.div>
        </div>
      </div>
    </section>
  );
}

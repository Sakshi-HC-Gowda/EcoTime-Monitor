import { motion } from 'framer-motion';
import { ArrowRight, Play } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function Hero() {
  return (
    <section className="relative w-full min-h-screen pt-24 pb-16 md:pt-28 md:pb-20 lg:pt-32 lg:pb-24 overflow-hidden flex items-center">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-12 left-1/2 -translate-x-1/2 w-[760px] max-w-[90vw] h-[420px] bg-gradient-to-tr from-green-500/15 via-emerald-500/8 to-cyan-500/10 blur-[110px] rounded-full animate-aurora" />
      </div>

      <div className="landing-container relative z-10 max-w-[1280px] mx-auto px-6 md:px-12">
        <div className="text-center max-w-4xl mx-auto flex flex-col items-center">
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
            className="text-[clamp(2.5rem,6vw,4rem)] md:text-5xl lg:text-7xl font-extrabold tracking-tight text-white leading-tight mb-8 text-balance"
          >
            Schedule Smarter.<br className="hidden md:block" />{' '}
            <span className="bg-gradient-to-r from-green-400 via-emerald-300 to-teal-200 bg-clip-text text-transparent">
              Emit Less.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.16 }}
            className="text-base md:text-lg lg:text-xl text-slate-300 font-normal leading-relaxed max-w-3xl mx-auto mb-12"
          >
            EcoTime helps you schedule digital activities during cleaner energy periods to reduce carbon emissions without missing deadlines.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.24 }}
            className="mb-16 flex flex-col items-center justify-center gap-6 sm:flex-row md:mb-20"
          >
            <Button
              to="/dashboard"
              fullWidth
              className="sm:w-auto px-8 py-4 text-base"
              iconRight={<ArrowRight className="w-5 h-5 ml-2" />}
            >
              Get Started
            </Button>

            <Button
              href="#workflow"
              variant="secondary"
              fullWidth
              className="sm:w-auto px-8 py-4 text-base"
              iconLeft={<Play className="w-5 h-5 mr-2 text-green-400 fill-green-400" />}
            >
              Watch Demo
            </Button>
          </motion.div>

        </div>
      </div>
    </section>
  );
}

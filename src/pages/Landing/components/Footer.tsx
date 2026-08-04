import { Leaf } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function Footer() {
  return (
    <footer className="relative z-10 border-t border-white/[0.06] bg-[#070a13] py-[var(--space-16)] md:py-20">
      <div className="landing-container">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8 mb-12">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-[var(--radius-card)] bg-gradient-to-br from-green-500 to-teal-400 p-px">
              <div className="flex h-full w-full items-center justify-center rounded-[var(--radius-card)] bg-[#070a13]">
                <Leaf className="w-5 h-5 text-green-400" />
              </div>
            </div>
            <div>
              <span className="text-lg font-bold text-white tracking-tight block">EcoTime</span>
              <span className="text-sm text-slate-400">Carbon-Aware Scheduling Platform</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 md:gap-8 text-sm text-slate-400 font-medium">
            <a href="#features">Features</a>
            <a href="#workflow">How it Works</a>
            {/* <a href="#dashboard-preview">Preview</a> */}
          </div>
        </div>

        <div className="pt-8 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-6">
          <p className="text-sm text-slate-500 text-center sm:text-left">
            © {new Date().getFullYear()} EcoTime. All rights reserved.
          </p>
          <Button
            to="/dashboard"
            size="sm"
            variant="secondary"
          >
            Get Started
          </Button>
        </div>
      </div>
    </footer>
  );
}

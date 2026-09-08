import { CalendarClock } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';

export function SchedulerPage() {
  return (
    <div className="page-shell page-stack max-w-[1650px] mx-auto">
      <div>
        <h1 className="page-header-title heading-row">
          <CalendarClock className="text-eco-blue h-8 w-8 flex-shrink-0" />
          Scheduler
        </h1>
        <p className="page-header-subtitle">Timeline scheduler for carbon-aware job execution.</p>
      </div>
      <GlassCard padding="lg" className="text-center py-16">
        <CalendarClock className="mx-auto mb-4 h-12 w-12 text-eco-blue opacity-60" />
        <h2 className="card-title mb-2">Coming Soon</h2>
        <p className="text-base text-slate-400 max-w-md mx-auto">Interactive timeline scheduling is being built in Phase 10.</p>
      </GlassCard>
    </div>
  );
}

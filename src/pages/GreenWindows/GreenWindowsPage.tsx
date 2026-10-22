import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wind, Calendar, LayoutList } from 'lucide-react';
import { useGreenWindows } from '@/features/carbon/hooks/useCarbon';
import { useZone } from '@/app/ZoneProvider';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { WindowCard } from '@/features/windows/components/WindowCard';
import { WindowTimeline } from '@/features/windows/components/WindowTimeline';
import { WindowCalendar } from '@/features/windows/components/WindowCalendar';
import type { GreenWindow } from '@/types/domain';

type ViewMode = 'cards' | 'timeline' | 'calendar';

const VIEW_OPTIONS: { value: ViewMode; label: string; icon: React.ElementType }[] = [
  { value: 'cards', label: 'Cards', icon: LayoutList },
  { value: 'timeline', label: 'Timeline', icon: Wind },
  { value: 'calendar', label: 'Calendar', icon: Calendar },
];

export function GreenWindowsPage() {
  const navigate = useNavigate();
  const { selectedZone } = useZone();
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const { data: windows, isLoading, isError, refetch } = useGreenWindows(selectedZone, 180);

  if (isLoading) {
    return (
      <div className="page-shell page-stack" style={{ maxWidth: '1440px' }}>
        <LoadingSkeleton count={1} height="h-14" variant="row" />
        <div className="card-grid card-grid-sm-1 card-grid-lg-2 mt-8">
          <LoadingSkeleton count={4} height="h-[420px]" />
        </div>
      </div>
    );
  }

  if (isError || !windows) {
    return (
      <div className="page-shell">
        <ErrorState onRetry={() => refetch()} />
      </div>
    );
  }

  const handleSchedule = (win: GreenWindow) => {
    navigate('/scheduler', { state: { targetWindow: win } });
  };

  return (
    <div className="page-shell page-stack" style={{ maxWidth: '1440px' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-2xl">
          <h1 className="flex items-center gap-3 text-3xl font-extrabold tracking-tight text-white mb-2">
            Green Windows
            <span className="ds-badge bg-teal-500/10 text-teal-400 border-teal-500/20 text-xs px-2.5 py-1">
              {windows.length} Detected
            </span>
          </h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            Automated detection and ranking of low-carbon grid windows weighted by intensity trough and capacity.
          </p>
        </div>

        {/* View mode segment control */}
        <div className="segment-control flex-shrink-0 self-start">
          {VIEW_OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setViewMode(value)}
              className={`segment-tab ${viewMode === value ? 'active' : ''}`}
              aria-pressed={viewMode === value}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      {viewMode === 'cards' && (
        <div className="card-grid card-grid-sm-1 card-grid-lg-2 items-stretch gap-6 lg:gap-8">
          {windows.map((win) => (
            <WindowCard key={win.id} window={win} onSchedule={handleSchedule} />
          ))}
        </div>
      )}

      {viewMode === 'timeline' && <WindowTimeline windows={windows} />}
      {viewMode === 'calendar' && <WindowCalendar windows={windows} />}
    </div>
  );
}

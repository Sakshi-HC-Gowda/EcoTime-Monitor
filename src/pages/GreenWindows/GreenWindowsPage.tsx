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
      <div className="page-shell page-stack max-w-[1650px] mx-auto">
        <LoadingSkeleton count={1} height="h-14" variant="row" />
        <div className="card-grid card-grid-sm-2 card-grid-lg-3">
          <LoadingSkeleton count={3} height="h-48" />
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
    <div className="page-shell page-stack max-w-[1650px] mx-auto">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-header-title heading-row">
            Green Windows
            <span className="ds-badge bg-teal-500/10 text-teal-400 border-teal-500/20">
              {windows.length} Detected
            </span>
          </h1>
          <p className="page-header-subtitle">
            Automated detection and ranking of low-carbon grid windows weighted by intensity trough and capacity.
          </p>
        </div>

        {/* View mode segment control */}
        <div className="segment-control flex-shrink-0">
          {VIEW_OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setViewMode(value)}
              className={`segment-tab ${viewMode === value ? 'active' : ''}`}
              aria-pressed={viewMode === value}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      {viewMode === 'cards' && (
        <div className="card-grid card-grid-sm-2 card-grid-lg-3">
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

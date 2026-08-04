import { useState } from 'react';
import { Plus, Filter } from 'lucide-react';
import { useActivitiesQuery, useActivityMutations } from '@/features/activities/hooks/useActivitiesQuery';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ActivityCard } from '@/features/activities/components/ActivityCard';
import { CreateActivityModal } from '@/features/activities/components/CreateActivityModal';

type TabStatus = 'all' | 'pending' | 'scheduled' | 'running' | 'completed';

const TABS: { value: TabStatus; label: string }[] = [
  { value: 'all',       label: 'All' },
  { value: 'pending',   label: 'Pending' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'running',   label: 'Running' },
  { value: 'completed', label: 'Completed' },
];

export function ActivitiesPage() {
  const [activeTab, setActiveTab] = useState<TabStatus>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data: activitiesData, isLoading, isError, refetch } = useActivitiesQuery(1, 200);
  const { createMutation, updateMutation, deleteMutation } = useActivityMutations();

  if (isLoading) {
    return (
      <div className="page-shell page-stack activities-page">
        <LoadingSkeleton count={1} height="h-16" variant="row" />
        <LoadingSkeleton count={1} height="h-14" variant="row" />
        <div className="card-grid card-grid-sm-2 card-grid-lg-3 activities-grid">
          <LoadingSkeleton count={3} height="h-52" />
        </div>
      </div>
    );
  }

  if (isError || !activitiesData) {
    return (
      <div className="page-shell activities-page">
        <ErrorState onRetry={() => refetch()} />
      </div>
    );
  }

  const tasks = activeTab === 'all'
    ? activitiesData.items
    : activitiesData.items.filter((task) => task.status === activeTab);

  return (
    <div className="page-shell page-stack activities-page">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="page-header activities-header">
        <div>
          <h1 className="page-header-title heading-row">
            Digital Workloads
            <span className="ds-badge bg-amber-500/10 text-amber-400 border-amber-500/20">
              {activitiesData.total} Total
            </span>
          </h1>
          <p className="page-header-subtitle">
            Register, monitor, and manage carbon-aware digital workloads with full lifecycle status controls.
          </p>
        </div>

        <div className="cluster">
          <Button size="sm" onClick={() => setIsModalOpen(true)} iconLeft={<Plus className="w-3.5 h-3.5" />}>
            Register Activity
          </Button>
        </div>
      </div>

      {/* ── Segment control tabs ────────────────────────────────────────────── */}
      <div className="segment-control activities-segment w-full sm:w-auto">
        {TABS.map(({ value, label }) => {
          const count = value === 'all'
            ? activitiesData.total
            : activitiesData.items.filter(t => t.status === value).length;

          return (
            <button
              key={value}
              onClick={() => setActiveTab(value)}
              className={`segment-tab ${activeTab === value ? 'active' : ''}`}
              aria-current={activeTab === value ? 'page' : undefined}
            >
              {label}
              {count > 0 && (
                <span className={`ds-badge ml-0.5 px-1.5 py-0.5 ${
                  activeTab === value
                    ? 'bg-white/10 text-white'
                    : 'bg-white/[0.05] text-slate-500'
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Activity grid ───────────────────────────────────────────────────── */}
      {tasks.length === 0 ? (
        <EmptyState
          icon={Filter}
          title="No activities in this status"
          description="Register a new digital workload or switch tabs to see other workloads."
          actionLabel="Register Activity"
          onAction={() => setIsModalOpen(true)}
          accentColor="amber"
        />
      ) : (
        <div className="card-grid card-grid-sm-2 card-grid-lg-3 activities-grid">
          {tasks.map((task) => (
            <ActivityCard
              key={task.id}
              activity={task}
              onUpdateStatus={(id, status, scheduledStartTime) =>
                updateMutation.mutate({ id, update: { status, scheduledStartTime } })
              }
              onDelete={(id) => deleteMutation.mutate(id)}
            />
          ))}
        </div>
      )}

      {/* ── Modal ──────────────────────────────────────────────────────────── */}
      <CreateActivityModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={(newTask) => createMutation.mutate(newTask)}
      />
    </div>
  );
}

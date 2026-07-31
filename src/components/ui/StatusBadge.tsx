interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const s = status.toLowerCase();

  let styles = 'bg-slate-500/10 text-slate-400 border-slate-500/20';
  let dotStyles = 'bg-slate-400';
  let isRunning = false;

  if (s === 'running' || s === 'active') {
    styles = 'bg-green-500/10 text-green-400 border-green-500/20';
    dotStyles = 'text-green-400';
    isRunning = true;
  } else if (s === 'completed') {
    styles = 'bg-green-500/10 text-green-400 border-green-500/20';
    dotStyles = 'bg-green-400';
  } else if (s === 'scheduled' || s === 'delayed' || s === 'paused') {
    styles = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    dotStyles = 'bg-amber-400';
  } else if (s === 'failed' || s === 'error') {
    styles = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
    dotStyles = 'bg-rose-400';
  } else if (s === 'pending' || s === 'idle') {
    styles = 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    dotStyles = 'bg-blue-400';
  }

  return (
    <span
      className={`ds-badge uppercase tracking-wider ${styles}`}
    >
      {isRunning ? (
        <span className={`status-dot-running ${dotStyles}`} aria-hidden="true" />
      ) : (
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotStyles}`} aria-hidden="true" />
      )}
      {status}
    </span>
  );
}

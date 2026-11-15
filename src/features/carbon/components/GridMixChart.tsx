export function GridMixChart() {
  return (
    <div className="flex h-64 items-center justify-center text-center">
      <div>
        <p className="text-sm font-semibold text-slate-300">Renewable mix unavailable</p>
        <p className="mt-2 max-w-sm text-xs text-slate-500">
          The current carbon data response does not include generation-source percentages.
        </p>
      </div>
    </div>
  );
}

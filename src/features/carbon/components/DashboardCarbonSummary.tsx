import { MapPin, Globe, Activity, Loader2 } from 'lucide-react';
import { useZone } from '@/app/ZoneProvider';

interface DashboardCarbonSummaryProps {
  currentCarbon: number;
  isSimulated: boolean;
}

export function DashboardCarbonSummary({ currentCarbon, isSimulated }: DashboardCarbonSummaryProps) {
  const { selectedZone, detectedLocation, locationStatus } = useZone();

  const detectedLabel =
    locationStatus === 'detecting'
      ? 'Detecting…'
      : detectedLocation?.state && detectedLocation?.country
        ? `${detectedLocation.state}, ${detectedLocation.country}`
        : detectedLocation?.state || detectedLocation?.country || 'Not detected';

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-4 sm:grid-cols-3 flex-1">
          <div className="flex items-start gap-2.5">
            <MapPin className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
                Detected Location
              </p>
              <p className="text-[15px] font-bold text-white mt-0.5 flex items-center gap-2">
                {locationStatus === 'detecting' && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
                )}
                {detectedLabel}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <Globe className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
                Grid Zone
              </p>
              <p className="text-[15px] font-bold text-blue-300 mt-0.5">{selectedZone}</p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <Activity className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
                Current Carbon
              </p>
              <p className="text-[15px] font-bold text-white mt-0.5">
                {currentCarbon}{' '}
                <span className="text-[12px] font-medium text-slate-400">gCO₂/kWh</span>
              </p>
            </div>
          </div>
        </div>

        <span
          className={`self-start px-2.5 py-1 rounded-full text-[11px] font-bold border flex-shrink-0 ${
            isSimulated
              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
              : 'bg-green-500/10 text-green-400 border-green-500/20'
          }`}
        >
          {isSimulated ? 'Simulated' : 'Live Electricity Maps'}
        </span>
      </div>
    </div>
  );
}

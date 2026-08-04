import { MapPin } from 'lucide-react';
import { useZone } from '@/app/ZoneProvider';

export function DetectedLocationInfo() {
  const { selectedZone, detectedLocation, locationStatus } = useZone();

  if (locationStatus === 'detecting') {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <MapPin className="w-3.5 h-3.5 animate-pulse" />
        <span>Detecting your location…</span>
      </div>
    );
  }

  const country = detectedLocation?.country;
  const state = detectedLocation?.state;

  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-green-400 mt-0.5" />
      <div className="min-w-0 leading-snug">
        {country && (
          <p className="text-[13px] font-semibold text-white truncate">{country}</p>
        )}
        {state && (
          <p className="text-[12px] text-slate-400 truncate">{state}</p>
        )}
        <p className="text-[12px] font-bold text-green-400 mt-0.5">{selectedZone}</p>
      </div>
    </div>
  );
}

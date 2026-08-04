import { MapPinOff } from 'lucide-react';
import { useZone } from '@/app/ZoneProvider';

export function LocationBanner() {
  const { locationStatus } = useZone();

  if (locationStatus !== 'denied') return null;

  return (
    <div
      role="status"
      className="flex items-center gap-2 px-4 sm:px-5 lg:px-6 py-2 text-[12px] text-amber-200 bg-amber-500/10 border-b border-amber-500/20"
    >
      <MapPinOff className="w-3.5 h-3.5 flex-shrink-0 text-amber-400" />
      <span>Location access denied. Please select your region manually.</span>
    </div>
  );
}

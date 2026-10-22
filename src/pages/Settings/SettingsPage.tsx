import { useEffect, useState } from 'react';
import { Users, ShieldCheck, Building2, AlertTriangle } from 'lucide-react';
import { Settings } from '@/components/Settings';
import { GlassCard } from '@/components/ui/GlassCard';
import { useAuth } from '@/features/auth/AuthProvider';
import { useZone } from '@/app/ZoneProvider';
import { useTasks } from '@/hooks/useTasks';
import { useCarbonData } from '@/hooks/useCarbonData';
import { organizationService } from '@/services/organizationService';
import type { AuthUser } from '@/features/auth/types';

const DEFAULT_LOW_CARBON_THRESHOLD = 180;
const DEFAULT_BASELINE_INTENSITY = 380;

function readStoredNumber(key: string, fallback: number): number {
  const storedValue = localStorage.getItem(key);
  if (storedValue === null) return fallback;
  const value = Number(storedValue);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function SettingsPage() {
  const { user } = useAuth();
  const { selectedZone, setSelectedZone } = useZone();
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('ecotime_api_key') ?? '');
  const [lowCarbonThreshold, setLowCarbonThreshold] = useState(() =>
    readStoredNumber('ecotime_low_carbon_threshold', DEFAULT_LOW_CARBON_THRESHOLD),
  );
  const [baselineIntensity, setBaselineIntensity] = useState(() =>
    readStoredNumber('ecotime_baseline_intensity', DEFAULT_BASELINE_INTENSITY),
  );
  const { tasks, totalSavingsGrams, resetAll } = useTasks();
  const zone = selectedZone ?? 'US-CA';
  const { carbonData } = useCarbonData({
    zone,
    apiKey: apiKey || null,
    lowCarbonThreshold,
    offsetHours: 0,
  });
  const [members, setMembers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.organizationId || user.role?.name !== 'Organization Admin') {
      setMembers([]);
      return;
    }

    let cancelled = false;
    const loadMembers = async () => {
      setLoading(true);
      setError(null);

      try {
        const data = await organizationService.getMembers(user.organizationId!);
        if (!cancelled) setMembers(data.members ?? []);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load organization members');
          setMembers([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadMembers();
    return () => {
      cancelled = true;
    };
  }, [user?.organizationId, user?.role?.name]);

  const isAdmin = user?.role?.name === 'Organization Admin';

  const handleApiKeyChange = (key: string) => {
    setApiKey(key);
    localStorage.setItem('ecotime_api_key', key);
  };

  const handleThresholdChange = (threshold: number) => {
    setLowCarbonThreshold(threshold);
    localStorage.setItem('ecotime_low_carbon_threshold', String(threshold));
  };

  const handleBaselineChange = (baseline: number) => {
    setBaselineIntensity(baseline);
    localStorage.setItem('ecotime_baseline_intensity', String(baseline));
  };

  return (
    <div className="page-shell-narrow page-stack">
      <div>
        <h1 className="page-header-title heading-row">
          Settings
          <span className="ds-badge bg-white/[0.06] text-slate-400">
            Configuration
          </span>
        </h1>
        <p className="page-header-subtitle">Configure EcoTime preferences and organization access.</p>
      </div>

      <div className="section-stack">
        <Settings
          apiKey={apiKey}
          selectedZone={zone}
          lowCarbonThreshold={lowCarbonThreshold}
          baselineIntensity={baselineIntensity}
          onApiKeyChange={handleApiKeyChange}
          onZoneChange={setSelectedZone}
          onThresholdChange={handleThresholdChange}
          onBaselineChange={handleBaselineChange}
          onResetStatistics={resetAll}
          isSimulated={carbonData?.isSimulated ?? null}
        />
        <GlassCard variant="elevated" className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-slate-400">Local demo simulation state</span>
          <span className="text-slate-200">
            {tasks.length} demo tasks · {totalSavingsGrams.toFixed(1)} gCO2e estimated net savings
          </span>
        </GlassCard>
      </div>

      <div>
        <h2 className="page-header-title heading-row">
          Organization
          <span className="ds-badge bg-white/[0.06] text-slate-400">Members</span>
        </h2>
        <p className="page-header-subtitle">Current organization access and user membership for this tenant.</p>
      </div>

      <div className="section-stack">
        <GlassCard variant="elevated" className="flex items-center gap-4">
          <div className="ds-icon-box bg-green-500/10 border-green-500/20 text-green-400">
            <Building2 className="ds-icon-lg" />
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-white">{user?.organization?.name ?? 'No organization'}</p>
            <p className="text-xs text-slate-500 mt-0.5">Tenant ID: {user?.organizationId ?? 'None'}</p>
          </div>
          <div className="ml-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-300">
            {isAdmin ? <ShieldCheck className="h-3 w-3 text-green-400" /> : <Users className="h-3 w-3 text-slate-400" />}
            {isAdmin ? 'Admin' : 'Employee'}
          </div>
        </GlassCard>

        {isAdmin ? (
          <GlassCard variant="elevated" className="p-0 overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-slate-300" />
                <h2 className="text-sm font-semibold text-white">Organization users</h2>
              </div>
              <span className="text-[11px] text-slate-400">{members.length} users</span>
            </div>

            {loading ? (
              <div className="px-5 py-6 text-sm text-slate-400">Loading organization members...</div>
            ) : error ? (
              <div className="flex items-start gap-3 px-5 py-6 text-sm text-rose-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 text-rose-300" />
                <span>{error}</span>
              </div>
            ) : members.length === 0 ? (
              <div className="px-5 py-6 text-sm text-slate-400">No organization members are available for this tenant.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-white/[0.02] text-slate-400">
                    <tr>
                      <th className="px-5 py-3 font-medium">Name</th>
                      <th className="px-5 py-3 font-medium">Email</th>
                      <th className="px-5 py-3 font-medium">Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((member) => (
                      <tr key={member.id} className="border-t border-white/10 text-slate-200">
                        <td className="px-5 py-3">{member.firstName} {member.lastName}</td>
                        <td className="px-5 py-3">{member.email}</td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${member.role?.name === 'Organization Admin' ? 'border-green-500/30 bg-green-500/10 text-green-300' : 'border-white/10 bg-white/5 text-slate-300'}`}>
                            {member.role?.name ?? 'Employee'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </GlassCard>
        ) : (
          <GlassCard variant="elevated" className="flex items-start gap-3 text-sm text-slate-300">
            <Users className="mt-0.5 h-4 w-4 text-slate-400" />
            <span>Only organization admins can view organization members.</span>
          </GlassCard>
        )}
      </div>
    </div>
  );
}

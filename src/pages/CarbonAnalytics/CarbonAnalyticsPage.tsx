import { Activity, Globe, Leaf, Zap, TrendingDown } from 'lucide-react';
import { useCarbon } from '@/features/carbon/hooks/useCarbon';
import { useZone } from '@/app/ZoneProvider';
import { DetectedLocationInfo } from '@/features/carbon/components/DetectedLocationInfo';
import { MANUAL_ZONE_OPTIONS } from '@/features/carbon/constants/zoneOptions';
import { GlassCard } from '@/components/ui/GlassCard';
import { MetricCard } from '@/components/ui/MetricCard';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { CarbonTrendChart } from '@/features/carbon/components/CarbonTrendChart';
import { GridMixChart } from '@/features/carbon/components/GridMixChart';
import { HeatMap } from '@/features/carbon/components/HeatMap';
import { HourlyTimeline } from '@/features/carbon/components/HourlyTimeline';
import { RegionComparison } from '@/features/carbon/components/RegionComparison';

export function CarbonAnalyticsPage() {
  const { selectedZone, setSelectedZone } = useZone();
  const { data: carbon, isLoading, isError, refetch } = useCarbon(selectedZone);

  if (isLoading) {
    return (
      <div className="page-shell page-stack max-w-[1650px] mx-auto">
        <LoadingSkeleton count={1} height="h-14" variant="row" />
        <div className="card-grid card-grid-sm-2 card-grid-lg-4">
          <LoadingSkeleton count={4} height="h-28" />
        </div>
        <LoadingSkeleton count={2} height="h-64" />
      </div>
    );
  }

  if (isError || !carbon) {
    return (
      <div className="page-shell">
        <ErrorState onRetry={() => refetch()} />
      </div>
    );
  }

  const current = carbon.current.carbonIntensity;
  const isOptimal = current < 180;

  return (
    <div className="page-shell page-stack max-w-[1650px] mx-auto">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-header-title heading-row">
            Carbon Analytics
            <span className="ds-badge bg-blue-500/10 text-blue-400 border-blue-500/20">
              Live Grid Telemetry
            </span>
          </h1>
          <p className="page-header-subtitle">
            Comprehensive carbon intensity analysis, historical trends, renewable mix, and regional benchmarking.
          </p>
        </div>

        <div className="flex flex-col sm:items-end gap-2 flex-shrink-0">
          <DetectedLocationInfo />
          <div className="cluster">
            <Globe className="ds-icon-sm text-slate-500" />
            <select
              value={selectedZone}
              onChange={(e) => setSelectedZone(e.target.value)}
              className="ds-control h-10 pl-3 pr-8 bg-slate-900/80 border border-white/[0.08] text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500/40 appearance-none cursor-pointer"
            >
              {MANUAL_ZONE_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── KPI metrics ────────────────────────────────────────────────────── */}
      <div className="card-grid card-grid-sm-2 card-grid-lg-4">
        <MetricCard
          title="Current Carbon"
          value={current}
          unit="gCO₂/kWh"
          subtitle={isOptimal ? 'Optimal grid range' : 'Above threshold'}
          icon={Activity}
          iconColor={isOptimal ? 'text-green-400' : 'text-amber-400'}
          iconBg={isOptimal ? 'bg-green-500/10 border-green-500/20' : 'bg-amber-500/10 border-amber-500/20'}
          accentClass={isOptimal ? 'metric-accent-green' : 'metric-accent-amber'}
        />

        <MetricCard
          title="Renewable Mix"
          value="62"
          unit="%"
          subtitle="High solar & wind share"
          icon={Leaf}
          iconColor="text-green-400"
          iconBg="bg-green-500/10 border-green-500/20"
          accentClass="metric-accent-green"
          trend={{ value: '4% vs last week', positive: true }}
        />

        <MetricCard
          title="24h Peak Carbon"
          value="340"
          unit="gCO₂/kWh"
          subtitle="Thermal peak at 19:00"
          icon={Zap}
          iconColor="text-rose-400"
          iconBg="bg-rose-500/10 border-rose-500/20"
          accentClass="metric-accent-rose"
        />

        <MetricCard
          title="24h Lowest Carbon"
          value="112"
          unit="gCO₂/kWh"
          subtitle="Solar trough at 13:00"
          icon={TrendingDown}
          iconColor="text-teal-400"
          iconBg="bg-teal-500/10 border-teal-500/20"
          accentClass="metric-accent-teal"
        />
      </div>

      {/* ── Historical & Forecast Trend Chart ──────────────────────────────── */}
      <GlassCard>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-4 h-4 text-blue-400" />
              <h3 className="text-[15px] font-bold text-white">Historical & Forecast Carbon Trend</h3>
            </div>
            <p className="text-xs text-slate-500">Past 12 hours vs next 24 hours carbon intensity curve</p>
          </div>
          <div className="flex items-center gap-4 text-[11px] font-bold flex-shrink-0">
            <span className="flex items-center gap-1.5 text-blue-400">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0" /> Historical
            </span>
            <span className="flex items-center gap-1.5 text-green-400">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" /> Forecast
            </span>
          </div>
        </div>

        <CarbonTrendChart history={carbon.history} forecast={carbon.forecast} />
      </GlassCard>

      {/* ── Grid Mix & Region Comparison ───────────────────────────────────── */}
      <div className="card-grid card-grid-lg-2">
        <GlassCard>
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-4 h-4 text-amber-400" />
            <h3 className="text-[15px] font-bold text-white">Generation Energy Mix</h3>
          </div>
          <p className="text-xs text-slate-500 mb-5">Breakdown of primary power generation sources</p>
          <GridMixChart />
        </GlassCard>

        <GlassCard>
          <div className="flex items-center gap-2 mb-1">
            <Leaf className="w-4 h-4 text-green-400" />
            <h3 className="text-[15px] font-bold text-white">Regional Benchmarking</h3>
          </div>
          <p className="text-xs text-slate-500 mb-5">Carbon intensity comparison across grid zones</p>
          <RegionComparison />
        </GlassCard>
      </div>

      {/* ── HeatMap & Hourly Timeline ───────────────────────────────────────── */}
      <div className="card-grid card-grid-lg-2">
        <GlassCard>
          <HeatMap forecast={carbon.forecast} />
        </GlassCard>

        <GlassCard>
          <h3 className="text-[15px] font-bold text-white mb-4">Hourly Intensity Breakdown</h3>
          <HourlyTimeline forecast={carbon.forecast} />
        </GlassCard>
      </div>
    </div>
  );
}

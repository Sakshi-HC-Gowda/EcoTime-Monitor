import { TrendingUp } from 'lucide-react';
import { useForecast, useForecastInfo, useTrainModel } from '@/features/forecast/hooks/useForecast';
import { useZone } from '@/app/ZoneProvider';
import { GlassCard } from '@/components/ui/GlassCard';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { ForecastChart } from '@/features/forecast/components/ForecastChart';
import { ModelInfoCard } from '@/features/forecast/components/ModelInfoCard';
import { ForecastStats } from '@/features/forecast/components/ForecastStats';

export function ForecastPage() {
  const { selectedZone } = useZone();
  const { data: forecastData, isLoading, isError, refetch } = useForecast(selectedZone, 36);
  const { data: modelInfo } = useForecastInfo();
  const trainMutation = useTrainModel();

  if (isLoading) {
    return (
      <div className="page-shell page-stack max-w-[1650px] mx-auto">
        <LoadingSkeleton count={3} height="h-40" />
      </div>
    );
  }

  if (isError || !forecastData) {
    return (
      <div className="page-shell">
        <ErrorState onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div className="page-shell page-stack max-w-[1650px] mx-auto">
      <div>
        <h1 className="page-header-title heading-row">
          ML Carbon Forecast
          <span className="ds-badge bg-purple-500/10 text-purple-400 border-purple-500/20">
            36-Hour Horizon
          </span>
        </h1>
        <p className="page-header-subtitle">
          Predictive machine learning modeling for forward carbon intensity, confidence intervals, and optimal execution period detection.
        </p>
      </div>

      {/* Model Metadata Card */}
      <ModelInfoCard
        info={modelInfo}
        onTrain={() => trainMutation.mutate(4380)}
        isTraining={trainMutation.isPending}
      />

      {/* Forecast Statistics Cards */}
      <ForecastStats forecast={forecastData.forecast} />

      {/* Main 36h Chart */}
      <GlassCard>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-purple-400" /> 36-Hour Carbon Intensity Prediction
            </h3>
            <p className="text-xs text-slate-400">ML predicted carbon curve with confidence bands</p>
          </div>
        </div>

        <ForecastChart forecast={forecastData.forecast} />
      </GlassCard>
    </div>
  );
}

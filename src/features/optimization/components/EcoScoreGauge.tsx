import { useMemo } from 'react';

interface EcoScoreGaugeProps {
  score: number;
  size?: number;
  label?: string;
}

export function EcoScoreGauge({ score, size = 180, label = 'EcoScore' }: EcoScoreGaugeProps) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  // Map 0-100 to stroke-dashoffset
  const offset = circumference - (score / 100) * circumference;

  const colorClass = useMemo(() => {
    if (score >= 80) return 'text-green-500';
    if (score >= 50) return 'text-amber-500';
    return 'text-rose-500';
  }, [score]);

  return (
    <div className="flex flex-col items-center justify-center" style={{ width: size, height: size }}>
      <div className="relative w-full h-full flex items-center justify-center">
        {/* Background Circle */}
        <svg className="absolute w-full h-full -rotate-90 transform" viewBox="0 0 100 100">
          <circle
            className="text-white/10"
            strokeWidth="8"
            stroke="currentColor"
            fill="transparent"
            r={radius}
            cx="50"
            cy="50"
          />
          {/* Progress Circle */}
          <circle
            className={`${colorClass} transition-all duration-1000 ease-out`}
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            stroke="currentColor"
            fill="transparent"
            r={radius}
            cx="50"
            cy="50"
          />
        </svg>
        <div className="absolute flex flex-col items-center justify-center">
          <span className="text-4xl font-black text-white leading-none">{score}</span>
          <span className="text-[10px] text-slate-400 font-semibold uppercase mt-1">{label}</span>
        </div>
      </div>
    </div>
  );
}

import React from 'react';

type GlassCardVariant = 'default' | 'elevated' | 'inset';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  hoverEffect?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  variant?: GlassCardVariant;
}

const paddingMap = {
  none: '',
  sm:   'ds-card-pad-sm',
  md:   'ds-card-pad-md',
  lg:   'p-6 md:p-8',
};

const variantMap: Record<GlassCardVariant, string> = {
  default:  'bg-[#0b1220]/90 border-white/[0.07] shadow-lg shadow-black/20 rounded-2xl',
  elevated: 'bg-[#10192c]/95 border-emerald-500/20 shadow-xl shadow-black/30 rounded-2xl',
  inset:    'bg-[#070c16]/80 border-white/[0.04] rounded-2xl',
};

export function GlassCard({
  children,
  className = '',
  hoverEffect = false,
  padding = 'md',
  variant = 'default',
  ...props
}: GlassCardProps) {
  return (
    <div
      className={`
        ds-card border backdrop-blur-xl
        ${variantMap[variant]}
        ${paddingMap[padding]}
        ${hoverEffect
          ? 'ds-card-hover hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/16'
          : ''}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
}

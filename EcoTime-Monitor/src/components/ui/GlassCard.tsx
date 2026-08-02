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
  default:  'bg-slate-900/50 border-white/[0.06]',
  elevated: 'bg-slate-800/60 border-white/[0.10] shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]',
  inset:    'bg-[rgba(7,10,19,0.50)] border-white/[0.04]',
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
          ? 'ds-card-hover hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20'
          : ''}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
}

import { Link } from 'react-router-dom';
import { Leaf } from 'lucide-react';

interface LogoProps {
  showSubtitle?: boolean;
  to?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function Logo({ showSubtitle = false, to = '/', className = '', size = 'md' }: LogoProps) {
  const iconBoxSizes = {
    sm: 'h-8 w-8 rounded-xl',
    md: 'h-9 w-9 rounded-xl',
    lg: 'h-11 w-11 rounded-2xl',
  };

  const leafSizes = {
    sm: 'w-4 h-4',
    md: 'w-4.5 h-4.5',
    lg: 'w-5.5 h-5.5',
  };

  const titleSizes = {
    sm: 'text-sm font-bold',
    md: 'text-base font-bold',
    lg: 'text-xl font-bold',
  };

  const content = (
    <div className={`flex items-center gap-2.5 group min-w-0 ${className}`}>
      <div className={`${iconBoxSizes[size]} bg-gradient-to-br from-green-500 to-teal-400 p-px shadow-md shadow-green-500/20 group-hover:scale-[1.03] transition-transform duration-200 flex-shrink-0`}>
        <div className={`flex h-full w-full items-center justify-center ${iconBoxSizes[size]} bg-[#070a13]`}>
          <Leaf className={`${leafSizes[size]} text-green-400`} />
        </div>
      </div>
      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-2 leading-none">
          <span className={`${titleSizes[size]} tracking-tight text-white`}>
            EcoTime
          </span>
          <span className="ds-badge bg-green-500/10 text-green-400 border border-green-500/20 px-1.5 py-0.5 text-[10px] font-bold rounded-md leading-none">
            v2.0
          </span>
        </div>
        {showSubtitle && (
          <span className="text-[11px] text-slate-400 font-medium mt-1">Carbon-Aware Scheduling</span>
        )}
      </div>
    </div>
  );

  if (to) {
    return <Link to={to} className="inline-flex min-w-0 focus-visible:outline-none">{content}</Link>;
  }

  return content;
}

import { Link } from 'react-router-dom';
import { Leaf } from 'lucide-react';

interface LogoProps {
  showSubtitle?: boolean;
  to?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  collapsed?: boolean;
}

export function Logo({ showSubtitle = true, to = '/dashboard', className = '', size = 'md', collapsed = false }: LogoProps) {
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
      <div className={`${iconBoxSizes[size]} bg-gradient-to-br from-emerald-500 to-teal-400 p-[1px] shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition-transform duration-200 flex-shrink-0 rounded-xl`}>
        <div className={`flex h-full w-full items-center justify-center ${iconBoxSizes[size]} bg-[#070c14] rounded-xl`}>
          <Leaf className={`${leafSizes[size]} text-emerald-400`} />
        </div>
      </div>
      {!collapsed && (
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2 leading-none">
            <span className={`${titleSizes[size]} tracking-tight text-white font-extrabold`}>
              EcoTime
            </span>
            <span className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 text-[10px] font-bold rounded-md leading-none shadow-sm">
              v2.0
            </span>
          </div>
          {showSubtitle && (
            <span className="text-[10px] text-slate-400 font-medium tracking-wide mt-1 truncate">
              Carbon-Aware Scheduling
            </span>
          )}
        </div>
      )}
    </div>
  );

  if (to) {
    return <Link to={to} className="inline-flex min-w-0 focus-visible:outline-none">{content}</Link>;
  }

  return content;
}


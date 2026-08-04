import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'xs' | 'sm' | 'md' | 'icon' | 'icon-sm';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  to?: string;
  href?: string;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
  isLoading?: boolean;
  children?: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: `
    bg-gradient-to-r from-emerald-500 to-green-600 text-white
    shadow-md shadow-green-500/20 hover:shadow-green-500/35 hover:brightness-110
    active:scale-[0.98]
    focus-visible:ring-green-500/50
  `,
  secondary: `
    bg-white/[0.05] text-slate-200 border border-white/[0.10]
    hover:bg-white/[0.08] hover:border-white/[0.15] backdrop-blur-lg
    focus-visible:ring-white/20
  `,
  ghost: `
    bg-transparent text-slate-400 border border-white/[0.07]
    hover:text-white hover:bg-white/[0.05] hover:border-white/[0.12]
    focus-visible:ring-white/15
  `,
  danger: `
    bg-rose-500/10 text-rose-400 border border-rose-500/20
    hover:bg-rose-500/20 hover:border-rose-500/30
    focus-visible:ring-rose-500/30
  `,
};

const sizeClasses: Record<ButtonSize, string> = {
  xs:      'h-8 px-3 text-xs gap-1.5',
  sm:      'h-10 px-4 text-sm gap-2',
  md:      'h-11 px-5 text-sm gap-2',
  icon:    'h-10 w-10 p-0 justify-center',
  'icon-sm': 'h-8 w-8 p-0 justify-center',
};

const baseClasses = `
  ds-control inline-flex items-center justify-center font-semibold
  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-dark
  disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none
`;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', to, href, iconLeft, iconRight, fullWidth, isLoading, className = '', children, disabled, ...props },
  ref,
) {
  const classes = `
    ${baseClasses}
    ${variantClasses[variant]}
    ${sizeClasses[size]}
    ${fullWidth ? 'w-full' : ''}
    ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}
    ${className}
  `;

  const content = (
    <>
      {isLoading ? (
        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      ) : (
        <>
          {iconLeft}
          {children}
          {iconRight}
        </>
      )}
    </>
  );

  if (to) {
    return <Link to={to} className={classes}>{content}</Link>;
  }

  if (href) {
    return <a href={href} className={classes}>{content}</a>;
  }

  return (
    <button 
      ref={ref} 
      className={classes} 
      disabled={disabled || isLoading}
      {...props}
    >
      {content}
    </button>
  );
});

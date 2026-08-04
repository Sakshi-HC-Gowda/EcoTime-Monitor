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
  children?: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: `
    bg-gradient-to-r from-emerald-500 to-green-600 text-white
    shadow-md shadow-green-500/15 hover:shadow-green-500/25 hover:brightness-105
    active:scale-[0.98]
    focus-visible:ring-green-500/50
  `,
  secondary: `
    bg-white/[0.035] text-slate-200 border border-white/[0.08]
    hover:bg-white/[0.055] hover:border-white/[0.12] backdrop-blur-lg
    focus-visible:ring-white/20
  `,
  ghost: `
    bg-transparent text-slate-400 border border-white/[0.06]
    hover:text-white hover:bg-white/[0.04] hover:border-white/[0.10]
    focus-visible:ring-white/15
  `,
  danger: `
    bg-rose-500/10 text-rose-400 border border-rose-500/20
    hover:bg-rose-500/20 hover:border-rose-500/30
    focus-visible:ring-rose-500/30
  `,
};

const sizeClasses: Record<ButtonSize, string> = {
  xs:      'h-8 px-4 text-xs gap-2',
  sm:      'h-11 px-5 text-sm gap-2.5',
  md:      'h-12 px-6.5 text-sm gap-3',
  icon:    'h-11 w-11 p-0 justify-center',
  'icon-sm': 'h-9 w-9 p-0 justify-center',
};

const baseClasses = `
  ds-control inline-flex items-center justify-center font-semibold
  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-dark
  disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none
`;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', to, href, iconLeft, iconRight, fullWidth, className = '', children, ...props },
  ref,
) {
  const classes = `
    ${baseClasses}
    ${variantClasses[variant]}
    ${sizeClasses[size]}
    ${fullWidth ? 'w-full' : ''}
    ${className}
  `;

  const content = (
    <>
      {iconLeft}
      {children}
      {iconRight}
    </>
  );

  if (to) {
    return <Link to={to} className={classes}>{content}</Link>;
  }

  if (href) {
    return <a href={href} className={classes}>{content}</a>;
  }

  return (
    <button ref={ref} className={classes} {...props}>
      {content}
    </button>
  );
});

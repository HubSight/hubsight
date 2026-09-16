import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-orange-700 text-white hover:bg-orange-800',
  secondary:
    'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700',
  danger: 'bg-red-700 text-white hover:bg-red-800',
  ghost:
    'bg-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800',
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'min-h-8 px-3 py-1.5 text-xs',
  md: 'min-h-10 px-4 py-2.5 text-sm',
  lg: 'min-h-11 px-5 py-3 text-sm',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className = '', type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${buttonSizes[size]} ${buttonVariants[variant]} ${className}`}
      {...props}
    />
  ),
);

Button.displayName = 'Button';

export interface SurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  muted?: boolean;
}

export const Surface: React.FC<SurfaceProps> = ({ muted = false, className = '', ...props }) => (
  <div
    className={`${muted ? 'bg-slate-50 dark:bg-slate-800/60' : 'bg-white dark:bg-slate-900'} border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 ${className}`}
    {...props}
  />
);

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}

const statusTones: Record<NonNullable<StatusBadgeProps['tone']>, string> = {
  neutral: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200',
  success: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300',
  warning: 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300',
  danger: 'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300',
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  tone = 'neutral',
  className = '',
  children,
  ...props
}) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ${statusTones[tone]} ${className}`}
    {...props}
  >
    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden="true" />
    {children}
  </span>
);

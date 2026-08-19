import type { ButtonHTMLAttributes, AnchorHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const base =
  'pressable inline-flex items-center justify-center gap-2 rounded-pill font-semibold ' +
  'select-none disabled:pointer-events-none disabled:opacity-45 ' +
  'transition-[background-color,color,box-shadow,transform] duration-press ' +
  'ease-out-strong';

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-white shadow-[var(--shadow-sm)] hover:bg-brand-hover',
  secondary: 'bg-surface text-ink border border-line shadow-[var(--shadow-sm)] hover:border-line-strong',
  ghost: 'bg-transparent text-ink-muted hover:bg-surface-sunken hover:text-ink',
  danger: 'bg-critical-soft text-critical hover:brightness-95',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-[0.8125rem]',
  md: 'h-11 px-5 text-[0.9375rem]',
  lg: 'h-14 px-7 text-base w-full sm:w-auto',
};

interface CommonProps {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...props
}: CommonProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={cn(base, variants[variant], sizes[size], className)} {...props}>
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...props
}: CommonProps & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a className={cn(base, variants[variant], sizes[size], className)} {...props}>
      {children}
    </a>
  );
}

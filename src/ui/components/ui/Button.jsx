import { forwardRef } from 'react';
import { cn } from '../../lib/cn';

/**
 * primary     – the one forward action on a screen
 * secondary   – bordered, for everything else that matters
 * ghost       – low-emphasis, toolbars and inline actions
 * ink         – navy, for confirming inside drawers on dark-ish contexts
 * destructive – irreversible
 * reward      – gold, kid moments only (quiz finish)
 */
const VARIANTS = {
  primary: 'bg-primary text-primary-foreground chrome-primary',
  secondary: 'text-foreground chrome-secondary',
  glass: 'text-ink-foreground chrome-glass',
  ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
  ink: 'bg-ink text-ink-foreground hover:bg-[color-mix(in_oklch,var(--ink)_85%,var(--background))]',
  destructive: 'border border-border bg-card text-critical hover:border-critical hover:bg-critical-soft',
  reward: 'bg-reward text-reward-foreground press-reward',
};

// Phones (@max-3xl/app) get taller hit areas: 36–40px minimum.
const SIZES = {
  xs: 'h-7 gap-1 rounded-md px-2 text-[13px] @max-3xl/app:h-10 @max-3xl/app:px-3',
  sm: 'h-8 gap-1.5 rounded-[9px] px-3 text-[13.5px] @max-3xl/app:h-10 @max-3xl/app:px-3.5',
  md: 'h-10 gap-2 rounded-[10px] px-4 text-[14.5px]',
  lg: 'h-12 gap-2 rounded-xl px-5 text-base',
};

export const Button = forwardRef(function Button(
  { variant = 'secondary', size = 'md', icon: Icon, iconRight: IconRight, className, children, type = 'button', as, ...props },
  ref,
) {
  const iconSize = size === 'lg' ? 18 : size === 'md' ? 17 : 15;
  // as="span": looks like a button inside a row that is itself the click target (no nested buttons).
  const Comp = as ?? 'button';
  return (
    <Comp
      ref={ref}
      {...(Comp === 'button' ? { type } : { 'aria-hidden': true })}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-bold transition-[filter,transform,background-color,color]',
        'disabled:pointer-events-none disabled:opacity-45',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {Icon && <Icon size={iconSize} strokeWidth={2.2} aria-hidden />}
      {children}
      {IconRight && <IconRight size={iconSize} strokeWidth={2.2} aria-hidden />}
    </Comp>
  );
});

export const IconButton = forwardRef(function IconButton({ icon: Icon, label, size = 'md', className, children, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'relative grid shrink-0 place-items-center rounded-[9px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
        size === 'sm' ? 'size-8 @max-3xl/app:size-10' : 'size-9 @max-3xl/app:size-10',
        className,
      )}
      {...props}
    >
      <Icon size={size === 'sm' ? 16 : 18} strokeWidth={2.1} aria-hidden />
      {children}
    </button>
  );
});

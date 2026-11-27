import { forwardRef } from 'react';
import { cn } from '../../lib/cn';

/**
 * primary     – the one forward action on a screen: solid blue
 * secondary   – white with a border, for everything else that matters
 * glass       – secondary on the navy band
 * ghost       – text only, toolbars and inline actions
 * ink         – navy, for confirming inside drawers on dark-ish contexts
 * destructive – irreversible: solid red
 * reward      – the quiz finish; looks like primary (gold is only for stars)
 * Hover darkens a little. Nothing moves on press.
 */
const VARIANTS = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary-hover',
  secondary: 'border border-border bg-card text-foreground hover:bg-accent',
  glass: 'bg-ink-foreground/10 text-ink-foreground hover:bg-ink-foreground/15',
  ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
  ink: 'bg-ink text-ink-foreground hover:bg-sidebar-accent',
  destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive-hover',
  reward: 'bg-primary text-primary-foreground hover:bg-primary-hover',
};

// Phones (@max-3xl/app) get taller hit areas: 36–40px minimum.
const SIZES = {
  xs: 'h-7 gap-1 rounded-md px-2 text-small @max-3xl/app:h-10 @max-3xl/app:px-3',
  sm: 'h-8 gap-1.5 rounded-md px-3 text-small @max-3xl/app:h-10 @max-3xl/app:px-3.5',
  md: 'h-10 gap-2 rounded-md px-4 text-body',
  lg: 'h-12 gap-2 rounded-md px-5 text-body',
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
        'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium transition-colors',
        'disabled:pointer-events-none disabled:opacity-45',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {Icon && <Icon size={iconSize} strokeWidth={1.75} aria-hidden />}
      {children}
      {IconRight && <IconRight size={iconSize} strokeWidth={1.75} aria-hidden />}
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
        'relative grid shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
        size === 'sm' ? 'size-8 @max-3xl/app:size-10' : 'size-9 @max-3xl/app:size-10',
        className,
      )}
      {...props}
    >
      <Icon size={size === 'sm' ? 16 : 18} strokeWidth={1.75} aria-hidden />
      {children}
    </button>
  );
});

import { cn } from '../../lib/cn';
const logoSrc = '/logo-192.png';

export function LogoMark({ size = 40, className }) {
  return (
    <img
      src={logoSrc}
      alt="Mentoring Minds"
      width={size}
      height={size}
      draggable={false}
      className={cn('shrink-0 select-none drop-shadow-sm', className)}
    />
  );
}

export function Wordmark({ subtitle = 'with Vienne Elliott', className }) {
  return (
    <div className={cn('min-w-0 leading-none', className)}>
      <p className="truncate font-display text-[18px] font-semibold tracking-tight text-foreground">
        Mentoring Minds
      </p>
      {subtitle && (
        <p className="mt-1 truncate text-xs font-bold text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}

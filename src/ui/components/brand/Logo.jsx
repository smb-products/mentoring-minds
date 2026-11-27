import { cn } from '../../lib/cn';
const logoSrc = '/logo-192.png';

/** The brain logo: only on sign-in and the landing page. */
export function LogoMark({ size = 40, className }) {
  return (
    <img
      src={logoSrc}
      alt="Mentoring Minds"
      width={size}
      height={size}
      draggable={false}
      className={cn('shrink-0 select-none', className)}
    />
  );
}

/** Text wordmark, Inter 600. In the app (rail, phone nav) it stands in for the logo. */
export function Wordmark({ subtitle = 'with Vienne Elliott', className }) {
  return (
    <div className={cn('min-w-0 leading-none', className)}>
      <p className="truncate text-title text-foreground">
        Mentoring Minds
      </p>
      {subtitle && (
        <p className="mt-1 truncate text-caption text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}

import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { Calendar, ChartLine, SquareCheckBig, type LucideIcon } from 'lucide-react';
import { LogoMark } from '@/ui/components/brand/Logo';

/**
 * The auth screens' split layout (docs/design/sign-in.html, docs/DESIGN.md → Auth screens): a graph-paper panel
 * on the left with the brain logo, the headline and three feature rows, and the form on the right, at most 380px
 * wide. Stacked on phones, with the feature rows left out. Used by /sign-in and the forced new-password screen.
 *
 * The panel uses the landing page's --landing-* tokens (set by `.landing`) and its two patterns, inline here so
 * globals.css stays as it is. It stays bright in dark mode, like the landing page; the form side follows the app.
 */

const GRAPH_PAPER: CSSProperties = {
  backgroundImage:
    'linear-gradient(var(--landing-grid) 1px, transparent 1px), linear-gradient(90deg, var(--landing-grid) 1px, transparent 1px)',
  backgroundSize: '32px 32px',
};
const HIGHLIGHT: CSSProperties = { backgroundImage: 'linear-gradient(transparent 62%, var(--landing-highlight) 62%)' };

const FEATURES: { label: string; icon: LucideIcon }[] = [
  { label: 'Book and manage sessions', icon: Calendar },
  { label: 'Homework and Vienne’s feedback', icon: SquareCheckBig },
  { label: 'Progress and F.A.S.T. scores', icon: ChartLine },
];

/** The form side's title (700, on the auth screens only) and the line under it. */
export function AuthHeading({ title, lede }: { title: ReactNode; lede?: ReactNode }) {
  return (
    <div className="mb-7">
      <h2 className="text-[26px] leading-[1.2] font-bold tracking-[-0.025em]">{title}</h2>
      {lede && <p className="mt-1.5 text-body text-muted-foreground">{lede}</p>}
    </div>
  );
}

const side = 'px-6 sm:px-[clamp(24px,5vw,72px)]';

/**
 * `main={false}` for the forced new-password screen: it stands in for the app inside AppRoot, which has no page
 * content (`<main>`) until the new password is saved.
 */
export function AuthScreen({ title, lede, main = true, children }: { title?: ReactNode; lede?: ReactNode; main?: boolean; children: ReactNode }) {
  const FormSide = main ? 'main' : 'div';
  return (
    <div className="flex min-h-dvh flex-col bg-card font-sans text-foreground lg:flex-row">
      <aside
        data-auth-panel
        style={GRAPH_PAPER}
        className={`landing flex min-w-0 flex-col justify-between gap-6 bg-landing-hero py-8 text-[15px] leading-[1.55] text-landing-ink lg:flex-1 lg:gap-10 lg:py-12 ${side}`}
      >
        <Link href="/" className="flex w-fit items-center gap-2.5 rounded-md text-[17px] font-bold text-landing-ink">
          <LogoMark size={32} className="shrink-0" />
          Mentoring Minds Academy
        </Link>
        <div>
          <h1 className="max-w-[460px] text-[clamp(28px,3.6vw,44px)] leading-[1.08] font-bold tracking-[-0.035em]">
            Welcome back. Your child’s math, <span style={HIGHLIGHT} className="px-[3px]">all in one place</span>.
          </h1>
          <ul data-auth-features className="mt-8 hidden max-w-[420px] flex-col gap-3 lg:flex">
            {FEATURES.map(({ label, icon: Icon }) => (
              <li key={label} className="flex items-center gap-3 rounded-[14px] border border-landing-pill-line bg-landing-paper px-4 py-3.5">
                <Icon size={20} strokeWidth={1.75} className="shrink-0 text-landing-accent" aria-hidden />
                <span>{label}</span>
              </li>
            ))}
          </ul>
        </div>
        <Link href="/" className="hidden w-fit rounded-md text-[14px] text-landing-muted hover:text-landing-ink lg:inline-block">
          ← Back to mentoringmindsacademy.org
        </Link>
      </aside>

      <FormSide className={`flex min-w-0 flex-1 justify-center py-8 lg:items-center lg:py-12 ${side}`}>
        <div data-auth-form className="w-full max-w-[380px]">
          {title && <AuthHeading title={title} lede={lede} />}
          {children}
        </div>
      </FormSide>
    </div>
  );
}

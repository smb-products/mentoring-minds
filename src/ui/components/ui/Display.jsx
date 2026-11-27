import { FileBarChart, Star } from 'lucide-react';
import { cn } from '../../lib/cn';
import { initials } from './initials';

/* ── Avatar ── tone is Student.avatarColor ('brand' | 'reward' | 'good') or 'ink'/'neutral'/'sidebar'.
   Round, in quiet tints: gold is only for stars, and status colors only for status. */
const AVATAR_TONES = {
  brand: 'bg-brand-soft text-brand-soft-foreground',
  reward: 'bg-badge text-badge-foreground',
  good: 'bg-badge text-badge-foreground',
  ink: 'bg-ink text-ink-foreground',
  neutral: 'bg-badge text-badge-foreground',
  sidebar: 'bg-sidebar-primary text-sidebar-primary-foreground',
};
const AVATAR_SIZES = { xs: 'size-6 text-caption', sm: 'size-8 text-caption', md: 'size-10 text-small', lg: 'size-12 text-body' };

export function Avatar({ name, tone = 'neutral', size = 'sm', className }) {
  return (
    <span aria-hidden className={cn('grid shrink-0 place-items-center rounded-full font-semibold leading-none', AVATAR_TONES[tone] ?? AVATAR_TONES.neutral, AVATAR_SIZES[size], className)}>
      {initials(name)}
    </span>
  );
}

/* ── Status badge ── always a word, plus a shape so color is never the only cue */
const STATUS = {
  REQUESTED: ['Requested', 'warning', 'ring'],
  CONFIRMED: ['Confirmed', 'good', 'dot'],
  COMPLETED: ['Completed', 'neutral', 'check'],
  CANCELLED: ['Cancelled', 'neutral', 'bar'],
  DECLINED: ['Declined', 'critical', 'bar'],
  NO_SHOW: ['No-show', 'serious', 'bar'],
  ASSIGNED: ['To do', 'brand', 'ring'],
  SUBMITTED: ['To check', 'warning', 'dot'],
  GRADED: ['Graded', 'good', 'check'],
  RETURNED: ['Redo', 'serious', 'ring'],
  ACTIVE: ['Active', 'good', 'dot'],
  PAUSED: ['Paused', 'neutral', 'bar'],
  PREVIEW: ['Preview', 'warning', 'ring'],
  USED: ['Used', 'neutral', 'check'],
  EXPIRED: ['Expired', 'serious', 'bar'],
  REVOKED: ['Revoked', 'neutral', 'bar'],
  DRAFT: ['Draft', 'neutral', 'ring'],
  PUBLISHED: ['Published', 'good', 'dot'],
  LATE: ['Late', 'serious', 'bar'],
};
// Every badge is the same neutral tint with dark text. The tone is only the glyph's color.
const BADGE = 'inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-md bg-badge px-2 text-caption text-badge-foreground';
const GLYPH_TONES = {
  good: 'text-good-soft-foreground',
  warning: 'text-warning-soft-foreground',
  serious: 'text-serious-soft-foreground',
  critical: 'text-critical-soft-foreground',
  brand: 'text-brand',
  neutral: 'text-subtle-foreground',
};

function Glyph({ shape, tone }) {
  const color = GLYPH_TONES[tone];
  if (shape === 'ring') return <span className={cn('size-[7px] rounded-full border-[1.5px] border-current', color)} />;
  if (shape === 'bar') return <span className={cn('h-[1.5px] w-2 rounded-xs bg-current', color)} />;
  if (shape === 'check')
    return (
      <svg viewBox="0 0 10 10" className={cn('size-2.5', color)} aria-hidden>
        <path d="M1.5 5.2 4 7.5l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  return <span className={cn('size-[7px] rounded-full bg-current', color)} />;
}

export function StatusBadge({ status, label, className }) {
  const [text, tone, shape] = STATUS[status] ?? [status, 'neutral', 'dot'];
  return (
    <span className={cn(BADGE, className)}>
      <Glyph shape={shape} tone={tone} />
      {label ?? text}
    </span>
  );
}

/* ── Subject tag ── colored square + name; Subject.color is a chart token name */
const SUBJECT_BG = { 'chart-1': 'bg-chart-1', 'chart-2': 'bg-chart-2', 'chart-3': 'bg-chart-3', 'chart-4': 'bg-chart-4' };
export const subjectBg = (color) => SUBJECT_BG[color] ?? 'bg-chart-1';

export function SubjectTag({ subject, className }) {
  if (!subject) return null;
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5 text-small font-medium text-muted-foreground', className)}>
      <span className={cn('size-2 rounded-xs', subjectBg(subject.color))} aria-hidden />
      {subject.name}
    </span>
  );
}

/* ── FAST areas ── one chart colour per area, the same everywhere */
const AREA_COLOR = { frac: 'chart-2', alg: 'chart-3', geo: 'chart-4', strand_FR: 'chart-2', strand_AR: 'chart-3', strand_M: 'chart-4', strand_GR: 'chart-4', strand_DP: 'chart-3' };
export const areaColor = (area) => AREA_COLOR[area?.id?.replace(/^rc_\d_/, '')] ?? AREA_COLOR[area?.id] ?? 'chart-1';

export function AreaTag({ area, className }) {
  if (!area) return null;
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5 text-small font-medium text-muted-foreground', className)} title={area.fullName}>
      <span className={cn('size-2 shrink-0 rounded-xs', subjectBg(areaColor(area)))} aria-hidden />
      <span className="truncate">{area.name}</span>
    </span>
  );
}

/** Right-out-of-total per area, weakest first. areas: [{ id, name, fullName, right, total }] */
export function AreaBars({ areas, className, empty = 'No book work checked yet.' }) {
  if (!areas?.length) return <p className={cn('text-body text-muted-foreground', className)}>{empty}</p>;
  return (
    <ul className={cn('space-y-3', className)}>
      {areas.map((a) => {
        const pct = a.total ? Math.round((a.right / a.total) * 100) : 0;
        return (
          <li key={a.id}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2 text-body font-medium" title={a.fullName}><span className={cn('size-2.5 shrink-0 rounded-xs', subjectBg(areaColor(a)))} aria-hidden />{a.name}</span>
              <span className="tabular shrink-0 text-small font-medium text-muted-foreground">{a.right} of {a.total}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-sm bg-muted" role="img" aria-label={`${a.name}: ${a.right} of ${a.total} right`}>
              <div className="h-full rounded-sm bg-primary" style={{ width: `${Math.max(pct, 4)}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** FAST achievement level 1–5. Level 3 and up is on grade level. */
export const LEVEL_TEXT = { 1: 'Well below grade level', 2: 'Below grade level', 3: 'On grade level', 4: 'Above grade level', 5: 'Well above grade level' };
/** Neutral, like every other badge: the level number says enough. */
export function LevelBadge({ level, className }) {
  if (!level) return null;
  return <span className={cn(BADGE, className)}>Level {level}</span>;
}

/* ── Page header ── on the light page, above the body */
export { PageHeader } from '../shell/Masthead';

/* ── Card ── white, a 1px border, 16px corners (rounded-lg) and at most a 1px shadow */
const CARD = 'rounded-lg border border-border bg-card shadow-card';

/* ── Section ── one bordered container per topic; rows inside use <Row> with hairlines */
export function Section({ title, description, action, children, className, bodyClassName, flush }) {
  return (
    <section className={cn(CARD, className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-border/80 px-4 py-3 @3xl/page:px-5">
          <div className="min-w-0">
            <h2 className="text-heading text-foreground">{title}</h2>
            {description && <p className="mt-0.5 text-small text-muted-foreground">{description}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={cn(flush ? '' : 'divide-y divide-border/80', bodyClassName)}>{children}</div>
    </section>
  );
}

export function Row({ children, onClick, className, as: As = onClick ? 'button' : 'div' }) {
  return (
    <As
      {...(As === 'button' && { type: 'button' })}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 px-4 py-3 text-left @3xl/page:px-5',
        onClick && 'transition-colors hover:bg-muted/60',
        className,
      )}
    >
      {children}
    </As>
  );
}

/* ── Empty state ── left aligned, says what to do */
export function Empty({ icon: Icon, title, children, action, className }) {
  return (
    <div className={cn('flex items-start gap-3 px-4 py-6 @3xl/page:px-5', className)}>
      {Icon && (
        <span className="grid size-9 shrink-0 place-items-center rounded-md border border-border text-subtle-foreground">
          <Icon size={18} strokeWidth={1.75} aria-hidden />
        </span>
      )}
      <div className="min-w-0 pt-0.5">
        <p className="text-body font-medium text-foreground">{title}</p>
        {children && <p className="mt-0.5 max-w-prose text-body text-muted-foreground">{children}</p>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}

/* ── Figures ── key numbers on the light page, below the header (App polish): one white card per number,
   each with a 40px tinted icon square in a fixed order of tints. Items without an icon get a plain chart one. */
const FIGURE_TINTS = ['bg-tile-blue text-tile-blue-foreground', 'bg-tile-amber text-tile-amber-foreground', 'bg-tile-green text-tile-green-foreground', 'bg-tile-violet text-tile-violet-foreground'];

export function Figures({ items, className }) {
  return (
    <div
      role="region"
      aria-label="Key numbers"
      className={cn('grid gap-2.5 @3xl/page:grid-cols-[repeat(var(--figures),minmax(0,1fr))] @3xl/page:gap-4', items.length > 1 ? 'grid-cols-2' : 'grid-cols-1', className)}
      style={{ '--figures': items.length }}
    >
      {items.map((item, i) => {
        const Comp = item.onClick ? 'button' : 'div';
        const Icon = item.icon ?? FileBarChart;
        return (
          <Comp
            key={item.label}
            {...(item.onClick && { type: 'button', onClick: item.onClick })}
            className={cn(CARD, 'group flex min-w-0 items-start gap-3 p-3 text-left transition-colors @3xl/page:gap-3.5 @3xl/page:p-4', item.onClick && 'hover:bg-accent')}
          >
            <span data-figure-icon className={cn('grid size-[40px] shrink-0 place-items-center rounded-tile', FIGURE_TINTS[i % FIGURE_TINTS.length])}>
              <Icon size={20} strokeWidth={1.75} aria-hidden />
            </span>
            <span className="block min-w-0">
              <span className="block truncate text-small font-medium text-muted-foreground">{item.label}</span>
              <span className="tabular mt-1 flex items-baseline gap-2 text-figure leading-none text-foreground">
                {item.value}
                {item.highlight && (
                  <>
                    <span className="size-2 -translate-y-1 rounded-full bg-warning" aria-hidden />
                    <span className="sr-only">needs attention</span>
                  </>
                )}
              </span>
              {item.note && <span className="mt-1.5 line-clamp-2 block text-caption font-normal text-subtle-foreground @3xl/page:truncate">{item.note}</span>}
            </span>
          </Comp>
        );
      })}
    </div>
  );
}

/* ── Loading placeholder while a page's data arrives ── */
export function PageLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading">
      <div className="grid gap-5 @4xl/page:grid-cols-[1.7fr_1fr]">
        <div className={cn(CARD, 'h-40 animate-pulse')} />
        <div className={cn(CARD, 'h-40 animate-pulse')} />
      </div>
      <div className={cn(CARD, 'h-64 animate-pulse')} />
    </div>
  );
}

/* ── Stars ── gold is reserved for earned stars */
export function Stars({ count, max = 3, size = 15, className }) {
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)} aria-label={`${count} of ${max} stars`} role="img">
      {Array.from({ length: max }, (_, i) => (
        <Star key={i} size={size} strokeWidth={2} className={i < count ? 'fill-reward text-reward-edge' : 'text-border'} aria-hidden />
      ))}
    </span>
  );
}

/* ── Skill meter ── 4-step rating used in reports */
export const RATING_LABELS = ['Beginning', 'Developing', 'Proficient', 'Mastered'];
export function SkillMeter({ rating, className }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div className="flex w-24 gap-1" aria-hidden>
        {[1, 2, 3, 4].map((step) => (
          <span key={step} className={cn('h-1.5 flex-1 rounded-xs', step <= rating ? 'bg-primary' : 'bg-border')} />
        ))}
      </div>
      <span className="w-[5.5rem] text-small font-medium text-foreground">{RATING_LABELS[rating - 1]}</span>
    </div>
  );
}

/* ── Progress bar ── */
export function Progress({ value, max, className }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-xs bg-muted', className)} role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <div className="h-full rounded-xs bg-primary transition-[width]" style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ── Labelled value pair for detail drawers ── */
export function Detail({ label, children }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 py-2 text-body">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-medium text-foreground">{children}</dd>
    </div>
  );
}

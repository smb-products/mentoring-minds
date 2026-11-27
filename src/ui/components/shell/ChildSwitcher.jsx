import { cn } from '../../lib/cn';
import { gradeShort } from '../../lib/format';
import { Avatar } from '../ui/Display';
import { useShell } from './ShellContext';

/** Parents with more than one child pick whose learning they're looking at. */
export function ChildSwitcher({ className }) {
  const { students, activeStudent, setActiveStudentId } = useShell();
  if (students.length < 2) return null;
  return (
    <div role="tablist" aria-label="Choose a child" className={cn('scrollbar-none flex gap-2 overflow-x-auto', className)}>
      {students.map((s) => {
        const selected = s.id === activeStudent?.id;
        return (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => setActiveStudentId(s.id)}
            className={cn(
              'flex h-10 shrink-0 items-center gap-2 rounded-md pl-1.5 pr-3 text-body font-medium transition-colors',
              selected ? 'bg-ink-foreground text-ink' : 'bg-ink-foreground/[0.08] text-ink-muted hover:text-ink-foreground',
            )}
          >
            <Avatar name={`${s.firstName} ${s.lastName}`} tone={s.avatarColor} size="xs" />
            {s.firstName}
            <span className={cn('font-normal', selected ? 'text-ink/70' : 'text-ink-muted')}>{s.grade === 0 ? 'K' : `Gr ${gradeShort(s.grade)}`}</span>
          </button>
        );
      })}
    </div>
  );
}

import { cn } from '../../lib/cn';
import { gradeShort } from '../../lib/format';
import { Avatar } from '../ui/Display';
import { useShell } from './ShellContext';

/** Parents with more than one child pick whose learning they're looking at. Sits on the gray page, below the band. */
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
              'flex h-10 shrink-0 items-center gap-2 rounded-md border pl-1.5 pr-3 text-body font-medium transition-colors',
              selected ? 'border-primary bg-brand-soft text-brand-soft-foreground' : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            <Avatar name={`${s.firstName} ${s.lastName}`} tone={s.avatarColor} size="xs" />
            {s.firstName}
            <span className="font-normal text-muted-foreground">{s.grade === 0 ? 'K' : `Gr ${gradeShort(s.grade)}`}</span>
          </button>
        );
      })}
    </div>
  );
}

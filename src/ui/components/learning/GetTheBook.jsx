import { BookOpen, ExternalLink } from 'lucide-react';
import { api, useAction } from '../../api';
import { Button } from '../ui/Button';
import { useResultToast } from '../ui/Toast';

/**
 * "Get the book" step for families: shown until the parent says they have this
 * grade's book. Comes back when the child moves up a grade (families.updateStudent).
 */
export function GetTheBook({ student, book, className }) {
  const show = useResultToast();
  const [confirm, saving] = useAction(api.books.setHasBook);
  if (!book) return null;
  return (
    <section aria-label="Get the book" className={`overflow-hidden rounded-lg border border-border bg-card shadow-card ${className ?? ''}`}>
      <div className="flex flex-col gap-4 p-4 @3xl/page:flex-row @3xl/page:items-center @3xl/page:gap-5 @3xl/page:p-5">
        <span className="grid size-12 shrink-0 place-items-center rounded-md bg-brand-soft text-brand-soft-foreground">
          <BookOpen size={22} strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-small font-medium text-muted-foreground">One thing to get</p>
          <p className="mt-1 text-title">{book.title}, Grade {book.grade}</p>
          <p className="mt-1 max-w-prose text-body text-muted-foreground">
            Vienne assigns {student.firstName}’s homework from this book. {student.firstName} works in the book, then types the answers here.
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 @3xl/page:w-52">
          <Button size="lg" variant="primary" disabled={saving} onClick={async () => show(await confirm({ studentId: student.id }), 'Thanks!', 'Vienne can see you have the book.')}>
            We have it
          </Button>
          <a href={book.buyUrl} target="_blank" rel="noreferrer" className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-border bg-card px-5 text-body font-medium text-foreground hover:bg-accent">
            Where to buy <ExternalLink size={16} strokeWidth={1.75} aria-hidden />
          </a>
        </div>
      </div>
    </section>
  );
}

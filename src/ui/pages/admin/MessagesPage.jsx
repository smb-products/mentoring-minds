'use client';

import { MessagesSquare } from 'lucide-react';
import { api, useQuery } from '../../api';
import { Thread } from '../../components/messages/Thread';
import { Avatar, Empty, PageHeader } from '../../components/ui/Display';
import { useShell } from '../../components/shell/ShellContext';
import { cn } from '../../lib/cn';
import { fmtAgo } from '../../lib/format';
import { Link } from '../../lib/router';

/**
 * /admin/messages and /admin/messages/[conversationId]
 * Wide screens: inbox and thread side by side. Phones: inbox, then the thread on its own page.
 * Data: messages.listThreads, messages.getThread.
 */
export default function AdminMessagesPage({ params = {} }) {
  const { mode } = useShell();
  const { data: threads = [] } = useQuery(() => api.messages.listThreads(), []);
  const activeId = params.conversationId;
  const active = threads.find((t) => t.id === activeId);
  const phone = mode === 'phone';

  const inbox = (
    <ul className="divide-y divide-border">
      {threads.map((t) => (
        <li key={t.id}>
          <Link
            href={`/admin/messages/${t.id}`}
            aria-current={t.id === activeId ? 'page' : undefined}
            className={cn('flex items-start gap-3 px-4 py-3 transition-colors', t.id === activeId ? 'bg-muted' : 'hover:bg-muted/60')}
          >
            <Avatar name={t.parent.name} size="md" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className={cn('truncate text-[14.5px]', t.unread ? 'font-extrabold' : 'font-bold')}>{t.parent.name}</p>
                <span className="shrink-0 text-[12px] font-semibold text-subtle-foreground">{t.lastMessage && fmtAgo(t.lastMessage.createdAt)}</span>
              </div>
              <p className="truncate text-[12.5px] font-semibold text-muted-foreground">{t.students.map((s) => s.firstName).join(', ')}</p>
              <p className={cn('mt-0.5 truncate text-[13.5px]', t.unread ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{t.lastMessage?.body ?? 'No messages yet'}</p>
            </div>
            {t.unread > 0 && <span className="tabular mt-1 rounded-md bg-primary px-1.5 text-[12px] font-extrabold text-primary-foreground">{t.unread}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );

  const threadHeader = active && (
    <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3 @3xl/page:px-6">
      <Avatar name={active.parent.name} size="md" />
      <div className="min-w-0">
        <p className="truncate text-[15px] font-extrabold">{active.parent.name}</p>
        <Link href={`/admin/families/${active.parent.id}`} className="text-[13px] hit-area font-bold text-brand hover:underline">
          Parent of {active.students.map((s) => s.firstName).join(' and ')}
        </Link>
      </div>
    </div>
  );

  if (phone) {
    return active ? (
      <>
        <PageHeader back={{ href: '/admin/messages', label: 'Messages' }} title={active.parent.name} subtitle={`Parent of ${active.students.map((s) => s.firstName).join(' and ')}`} />
        <div className="-mx-4 flex h-[calc(100dvh-19.5rem)] min-h-[22rem] flex-col border-y border-border">
          <Thread conversationId={active.id} className="h-full" />
        </div>
      </>
    ) : (
      <>
        <PageHeader title="Messages" subtitle="One conversation per family." />
        <div className="-mx-4 border-y border-border">{inbox}</div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Messages" subtitle="One conversation per family." />
      <div className="grid h-[calc(100dvh-13rem)] min-h-[30rem] grid-cols-[18rem_minmax(0,1fr)] overflow-hidden rounded-[14px] border border-border bg-card @5xl/page:grid-cols-[21rem_minmax(0,1fr)]">
        <div className="min-h-0 overflow-y-auto border-r border-border">{inbox}</div>
        {active ? (
          <Thread key={active.id} conversationId={active.id} header={threadHeader} className="h-full" />
        ) : (
          <div className="grid place-items-center">
            <Empty icon={MessagesSquare} title="Choose a conversation">Messages from each family stay in one thread.</Empty>
          </div>
        )}
      </div>
    </>
  );
}

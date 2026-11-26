'use client';

import { Thread } from '../../components/messages/Thread';
import { LockedPage, useLocked } from '../../components/shell/Locked';
import { useShell } from '../../components/shell/ShellContext';
import { Avatar, PageHeader } from '../../components/ui/Display';

/** /parent/messages — the family's one thread with Vienne. Data: messages.getThread. */
export default function ParentMessagesPage() {
  // A preview account can't read the thread yet. A paused one can: the paused notice (AppShell) says to message Vienne.
  const locked = useLocked();
  return locked && locked !== 'PAUSED' ? <LockedPage title="Messages" /> : <ParentMessages />;
}

function ParentMessages() {
  const { mode } = useShell();
  const phone = mode === 'phone';
  return (
    <>
      <PageHeader title="Messages" subtitle="Your family’s conversation with Vienne. She usually replies the same day." />
      <div className={phone ? '-mx-4 flex h-[calc(100dvh-19.5rem)] min-h-[22rem] flex-col border-y border-border' : 'flex h-[calc(100dvh-13rem)] min-h-[30rem] flex-col overflow-hidden rounded-[14px] border border-border bg-card'}>
        <Thread
          className="h-full"
          header={
            <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3 @3xl/page:px-6">
              <Avatar name="Vienne Elliott" tone="ink" size="md" />
              <div>
                <p className="text-[15px] font-extrabold">Vienne Elliott</p>
                <p className="text-[13px] text-muted-foreground">Tutor, Mentoring Minds</p>
              </div>
            </div>
          }
        />
      </div>
    </>
  );
}

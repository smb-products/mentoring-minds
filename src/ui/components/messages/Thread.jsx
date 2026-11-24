import { Fragment, useEffect, useRef, useState } from 'react';
import { SendHorizontal } from 'lucide-react';
import { api, useAction, useQuery } from '../../api';
import { cn } from '../../lib/cn';
import { fmtLongDay, fmtTime, sameDay } from '../../lib/format';
import { Button } from '../ui/Button';
import { useResultToast } from '../ui/Toast';
import { useShell } from '../shell/ShellContext';

/**
 * One family thread with a composer. Admin passes conversationId; parents omit it.
 * Data: messages.getThread. Writes: sendMessage, markThreadRead (on open).
 */
export function Thread({ conversationId, className, header }) {
  const { user } = useShell();
  const show = useResultToast();
  const { data } = useQuery(() => api.messages.getThread({ conversationId }), [conversationId]);
  const [body, setBody] = useState('');
  const [send, sending] = useAction(api.messages.sendMessage);
  const listRef = useRef(null);

  useEffect(() => {
    if (data?.unread) api.messages.markThreadRead({ conversationId });
  }, [data?.id, data?.unread, conversationId]);
  // Scroll only the message list (scrollIntoView would also scroll the page on iOS).
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [data?.messages.length]);

  if (!data) return null;
  const submit = async () => {
    if (!body.trim()) return;
    if (show(await send({ conversationId, body }))) setBody('');
  };

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      {header}
      <div ref={listRef} role="log" aria-label="Messages" tabIndex={0} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 @3xl/page:px-6">
        {data.messages.length === 0 && <p className="py-10 text-center text-[14px] text-muted-foreground">No messages yet. Say hello.</p>}
        <ol className="space-y-2">
          {data.messages.map((m, i) => {
            const mine = m.senderId === user.id;
            const newDay = i === 0 || !sameDay(m.createdAt, data.messages[i - 1].createdAt);
            const grouped = !newDay && data.messages[i - 1].senderId === m.senderId;
            return (
              <Fragment key={m.id}>
                {newDay && (
                  <li className="py-3 text-center text-[12.5px] font-bold text-subtle-foreground" aria-hidden>
                    {fmtLongDay(m.createdAt)}
                  </li>
                )}
                <li className={cn('flex flex-col', mine ? 'items-end' : 'items-start', grouped && '-mt-1')}>
                  {!grouped && !mine && <span className="mb-1 px-1 text-[12.5px] font-bold text-muted-foreground">{m.sender.name}</span>}
                  <div className={cn('max-w-[min(34rem,85%)] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[14.5px] leading-relaxed', mine ? 'rounded-br-md bg-ink text-ink-foreground' : 'rounded-bl-md bg-muted text-foreground')}>
                    {m.body}
                  </div>
                  <span className="mt-1 px-1 text-[11.5px] font-semibold text-subtle-foreground">{fmtTime(m.createdAt)}</span>
                </li>
              </Fragment>
            );
          })}
        </ol>
      </div>
      <div className="scrollbar-none flex shrink-0 gap-2 overflow-x-auto border-t border-border bg-card px-3 pt-3">
        {(user.role === 'ADMIN'
          ? ['Running about 5 minutes late.', 'See you then!', 'Thanks for letting me know.', 'Great work today!']
          : ['Running a few minutes late.', 'Thank you!', 'Can we move our next session?', 'Quick question about homework.']
        ).map((q) => (
          <button key={q} type="button" onClick={() => setBody(q)} className="h-8 shrink-0 rounded-full @max-3xl/app:h-10 border border-border bg-background px-3 text-[13px] font-bold text-muted-foreground hover:border-input/60 hover:text-foreground">
            {q}
          </button>
        ))}
      </div>
      <form
        className="flex shrink-0 items-end gap-2 bg-card p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor="composer" className="sr-only">Message</label>
        <textarea
          id="composer"
          rows={1}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={user.role === 'ADMIN' ? `Message ${data.parent.name.split(' ')[0]}` : 'Message Vienne'}
          className="max-h-40 min-h-10 flex-1 resize-none rounded-[10px] border border-input/70 bg-background px-3 py-2 text-[14.5px] font-medium leading-relaxed placeholder:text-subtle-foreground focus-visible:border-ring"
        />
        <Button type="submit" variant="primary" icon={SendHorizontal} disabled={sending || !body.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { CalendarCheck, CalendarPlus, History } from 'lucide-react';
import { api, useQuery } from '../../api';
import { ParentSessionDrawer } from '../../components/sessions/ParentSessionDrawer';
import { RequestSessionDrawer } from '../../components/sessions/RequestSessionDrawer';
import { SessionRow } from '../../components/sessions/SessionParts';
import { ChildSwitcher } from '../../components/shell/ChildSwitcher';
import { LockedPage, useLocked } from '../../components/shell/Locked';
import { useShell } from '../../components/shell/ShellContext';
import { Button } from '../../components/ui/Button';
import { Empty, PageHeader, Section } from '../../components/ui/Display';
import { PageLoading } from '../../components/ui/Display';

/** /parent/sessions — data: scheduling.listSessions({ studentId }) */
export default function ParentSessionsPage() {
  return useLocked() ? <LockedPage title="Sessions" /> : <ParentSessions />;
}

function ParentSessions() {
  const { activeStudent: kid } = useShell();
  const { data: sessions = [] } = useQuery(() => (kid ? api.scheduling.listSessions({ studentId: kid.id }) : []), [kid?.id]);
  const [tab, setTab] = useState('upcoming');
  const [requesting, setRequesting] = useState(false);
  const [selected, setSelected] = useState(null);
  if (!kid) return <PageLoading />;

  const now = new Date();
  const waiting = sessions.filter((s) => s.status === 'REQUESTED');
  const upcoming = sessions.filter((s) => s.status === 'CONFIRMED' && new Date(s.endsAt) > now);
  const past = sessions.filter((s) => (new Date(s.endsAt) <= now && s.status !== 'REQUESTED') || ['CANCELLED', 'DECLINED'].includes(s.status)).reverse();

  return (
    <>
      <PageHeader
        tabs={{ label: 'Session views', value: tab, onChange: setTab, items: [{ value: 'upcoming', label: 'Upcoming', count: waiting.length }, { value: 'past', label: 'Past' }] }} title="Sessions" subtitle={`${kid.firstName}’s sessions with Vienne.`} actions={<Button variant="primary" icon={CalendarPlus} onClick={() => setRequesting(true)}>Request a session</Button>} />
      <ChildSwitcher className="mb-5" />

      {tab === 'upcoming' && (
        <div className="space-y-6">
          {waiting.length > 0 && (
            <Section title="Waiting on Vienne" description="She’ll confirm or suggest another time.">
              {waiting.map((s) => <SessionRow key={s.id} session={s} showDate forParent onClick={() => setSelected(s)} />)}
            </Section>
          )}
          <Section title="Confirmed">
            {upcoming.length === 0 ? (
              <Empty icon={CalendarCheck} title="Nothing confirmed yet" action={<Button size="sm" onClick={() => setRequesting(true)}>Request a session</Button>}>
                Request a time and it shows up here once Vienne confirms it.
              </Empty>
            ) : (
              upcoming.map((s) => <SessionRow key={s.id} session={s} showDate forParent onClick={() => setSelected(s)} />)
            )}
          </Section>
        </div>
      )}

      {tab === 'past' && (
        <Section>
          {past.length === 0 ? (
            <Empty icon={History} title="No past sessions yet" />
          ) : (
            past.map((s) => (
              <div key={s.id}>
                <SessionRow session={s} showDate forParent onClick={() => setSelected(s)} />
                {s.note && (
                  <p className="-mt-1 line-clamp-2 pb-3 pl-[calc(4.6rem+2rem+3px)] pr-5 text-body text-muted-foreground">{s.note.summary}</p>
                )}
              </div>
            ))
          )}
        </Section>
      )}

      <RequestSessionDrawer open={requesting} onClose={() => setRequesting(false)} student={kid} />
      <ParentSessionDrawer session={selected} onClose={() => setSelected(null)} />
    </>
  );
}

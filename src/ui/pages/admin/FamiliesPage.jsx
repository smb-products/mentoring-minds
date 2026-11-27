'use client';

import { useState } from 'react';
import { BookX, CalendarPlus, Copy, KeyRound, MessageSquare, Plus, Search, Ticket, Trash2, UsersRound } from 'lucide-react';
import { api, useAction, useQuery } from '../../api';
import { Button } from '../../components/ui/Button';
import { Avatar, Empty, Figures, LevelBadge, PageHeader, Section, StatusBadge } from '../../components/ui/Display';
import { Field, Input, Select, Segmented, GRADE_OPTIONS } from '../../components/ui/Form';
import { Drawer } from '../../components/ui/Overlay';
import { useResultToast, useToast, useUndoToast } from '../../components/ui/Toast';
import { fmtDate, fmtDateYear, fmtRelativeDay, fmtTime, gradeShort } from '../../lib/format';
import { useRouter } from '../../lib/router';

/** Data: families.listFamilies, invites.listInvites */
export default function FamiliesPage() {
  const [tab, setTab] = useState('families');
  const { navigate } = useRouter();
  const setOpenFamily = (id) => navigate(`/admin/families/${id}`);
  const [inviting, setInviting] = useState(false);
  const { data: families = [] } = useQuery(() => api.families.listFamilies(), []);
  const { data: invites = [] } = useQuery(() => api.invites.listInvites(), []);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const [sort, setSort] = useState('name');
  const activeInvites = invites.filter((i) => i.status === 'ACTIVE').length;
  const q = query.trim().toLowerCase();
  const shown = families
    .filter((f) => !q || f.name.toLowerCase().includes(q) || f.students.some((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(q)))
    .filter((f) => !group || f.students.some((s) => (group === 'k2' ? s.grade <= 2 : group === 'fast' ? s.grade >= 3 : s.hasBook === false)))
    .sort((a, b) =>
      sort === 'next' ? (a.nextSession?.startsAt ?? '9').localeCompare(b.nextSession?.startsAt ?? '9') : sort === 'recent' ? b.createdAt.localeCompare(a.createdAt) : a.name.localeCompare(b.name),
    );

  return (
    <>
      <PageHeader
        tabs={{ label: 'Families views', value: tab, onChange: setTab, items: [{ value: 'families', label: 'Families' }, { value: 'invites', label: 'Invite codes', count: activeInvites }] }}
        title="Families"
        subtitle="Everyone you teach, and the invite codes you’ve shared."
        actions={<Button variant="primary" icon={KeyRound} onClick={() => setInviting(true)}>Invite family</Button>}
      />

      <Figures
        className="mb-5"
        items={[
          { label: 'Active families', value: families.filter((f) => f.status === 'ACTIVE').length, note: `${families.filter((f) => f.nextSession).length} with a session booked` },
          { label: 'Students', value: families.reduce((n, f) => n + f.students.length, 0), note: 'Kindergarten to grade 6' },
          { label: 'Open invite codes', value: activeInvites, onClick: () => setTab('invites'), note: 'Single use, 14 days' },
          { label: 'Waiting for a code', value: families.filter((f) => f.status === 'PREVIEW').length, highlight: families.some((f) => f.status === 'PREVIEW'), note: families.filter((f) => f.status === 'PREVIEW').map((f) => f.name.split(' ')[0]).join(', ') || 'None' },
        ]}
      />

      {tab === 'families' && (
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <label className="relative min-w-[14rem] flex-1 @3xl/page:max-w-xs">
            <span className="sr-only">Search families</span>
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search parents or children" className="pl-9" />
          </label>
          <Segmented size="sm" label="Show" value={group} onChange={setGroup} options={[{ value: '', label: 'Everyone' }, { value: 'k2', label: 'K–2' }, { value: 'fast', label: 'Grades 3–6' }, { value: 'book', label: 'Needs the book' }]} />
          <div className="ml-auto">
            <Segmented size="sm" label="Sort" value={sort} onChange={setSort} options={[{ value: 'name', label: 'A–Z' }, { value: 'next', label: 'Next session' }, { value: 'recent', label: 'Newest' }]} />
          </div>
        </div>
      )}

      {tab === 'families' && (
        shown.length === 0 ? (
          <Section>
            <Empty icon={UsersRound} title={families.length ? 'No families match' : 'No families yet'} action={!families.length && <Button size="sm" variant="primary" onClick={() => setInviting(true)}>Invite family</Button>}>
              {families.length ? 'Try another name or filter.' : 'Create an invite code and text it to a parent. Their family appears here when they join.'}
            </Empty>
          </Section>
        ) : (
          <div className="grid gap-4 @2xl/page:grid-cols-2 @5xl/page:grid-cols-3">
            {shown.map((f) => (
              <div key={f.id} role="link" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpenFamily(f.id)} onClick={() => setOpenFamily(f.id)} className="group flex cursor-pointer flex-col rounded-lg border border-border bg-card text-left shadow-card transition-colors hover:border-input">
                <div className="flex items-start gap-3 px-4 pb-3 pt-4">
                  <Avatar name={f.name} size="lg" tone="ink" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-heading group-hover:underline group-hover:decoration-border group-hover:underline-offset-4">{f.name}</p>
                    <p className="truncate text-small text-muted-foreground">{f.phone || f.email}</p>
                  </div>
                  <StatusBadge status={f.status} />
                </div>
                <ul className="mx-4 space-y-1.5 rounded-md bg-muted/70 p-2">
                  {f.students.length === 0 && <li className="px-1 py-1 text-small text-subtle-foreground">Waiting for their invite code</li>}
                  {f.students.map((s) => (
                    <li key={s.id} className="flex items-center gap-2.5 rounded-md bg-card px-2 py-1.5">
                      <Avatar name={`${s.firstName} ${s.lastName}`} tone={s.avatarColor} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body font-medium">{s.firstName}</span>
                        <span className="block text-caption font-normal text-muted-foreground">{s.grade === 0 ? 'Kindergarten' : `Grade ${s.grade}`}</span>
                      </span>
                      {s.hasBook === false && <span className="inline-flex items-center gap-1 text-caption text-warning-soft-foreground"><BookX size={14} strokeWidth={1.75} aria-hidden />No book yet</span>}
                      <LevelBadge level={s.latestLevel} />
                    </li>
                  ))}
                </ul>
                <dl className="mt-auto grid grid-cols-2 gap-3 px-4 pb-1 pt-3 text-small">
                  <div>
                    <dt className="font-medium text-muted-foreground">Next session</dt>
                    <dd className="tabular truncate font-medium">{f.nextSession ? `${fmtRelativeDay(f.nextSession.startsAt)}, ${fmtTime(f.nextSession.startsAt)}` : <span className="font-normal text-subtle-foreground">None booked</span>}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-muted-foreground">Sessions so far</dt>
                    <dd className="tabular font-medium">{f.completedSessions}</dd>
                  </div>
                </dl>
                <div className="flex gap-2 px-4 pb-4 pt-3" onClick={(e) => e.stopPropagation()}>
                  {f.conversationId && <Button size="sm" icon={MessageSquare} className="flex-1" onClick={() => navigate(`/admin/messages/${f.conversationId}`)}>Message</Button>}
                  {f.students.length > 0 && <Button size="sm" icon={CalendarPlus} className="flex-1" onClick={() => navigate('/admin/schedule')}>Book</Button>}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'invites' && <InviteList invites={invites} onInvite={() => setInviting(true)} />}

      <InviteDrawer open={inviting} onClose={() => setInviting(false)} />
    </>
  );
}

function CodeReveal({ code, name, expiresAt }) {
  const toast = useToast();
  return (
    <div className="rounded-lg border border-border bg-muted/50 p-5 text-center">
      <p className="text-small font-medium text-muted-foreground">Invite code for {name}</p>
      <p className="tabular mt-2 select-all text-figure tracking-[0.06em] text-foreground">{code}</p>
      <Button
        size="sm"
        icon={Copy}
        className="mt-3"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            toast({ title: 'Code copied' });
          } catch {
            toast({ tone: 'error', title: 'Couldn’t copy. Select the code and copy it.' });
          }
        }}
      >
        Copy code
      </Button>
      <p className="mt-4 text-small leading-relaxed text-muted-foreground">
        Text this to {name.split(' ')[0]}. It works once and expires {fmtDate(expiresAt)}. You won’t be able to see it again, but you can always make a new one.
      </p>
    </div>
  );
}

function InviteList({ invites, onInvite }) {
  const show = useResultToast();
  const undoable = useUndoToast();
  const [revoke] = useAction(api.invites.revokeInvite);
  const [restore] = useAction(api.invites.restoreInvite);
  const [regen] = useAction(api.invites.regenerateInvite);
  const [fresh, setFresh] = useState(null);

  return (
    <>
      <Section title="Invite codes" description="Codes are single-use and expire after 14 days. Only the last two characters are stored in a readable form.">
        {invites.length === 0 ? (
          <Empty icon={Ticket} title="No invite codes yet" action={<Button size="sm" onClick={onInvite}>Invite family</Button>} />
        ) : (
          invites.map((inv) => (
            <div key={inv.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 @3xl/page:px-5">
              <div className="min-w-0 flex-1">
                <p className="text-body font-medium">{inv.parentName}</p>
                <p className="text-small text-muted-foreground">
                  {inv.plannedStudents.map((s) => `${s.firstName} (${gradeShort(s.grade)})`).join(', ')}
                  {inv.status === 'USED' && `. Joined ${fmtDate(inv.usedAt)}`}
                  {inv.status === 'ACTIVE' && `. Expires ${fmtDate(inv.expiresAt)}`}
                  {inv.status === 'EXPIRED' && `. Expired ${fmtDate(inv.expiresAt)}`}
                </p>
              </div>
              <span className="tabular rounded-md border border-border px-2 py-0.5 text-small font-medium text-muted-foreground">{inv.codeHint}</span>
              <StatusBadge status={inv.status} />
              {['ACTIVE', 'EXPIRED', 'REVOKED'].includes(inv.status) && (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={async () => {
                    const data = show(await regen({ inviteId: inv.id }));
                    if (data) setFresh({ code: data.code, name: inv.parentName, expiresAt: new Date(Date.now() + 14 * 86400000).toISOString() });
                  }}>New code</Button>
                  {inv.status === 'ACTIVE' && <Button size="sm" variant="ghost" icon={Trash2} onClick={async () => undoable(await revoke({ inviteId: inv.id }), 'Code revoked', () => restore({ inviteId: inv.id }), 'It can no longer be used.')}>Revoke</Button>}
                </div>
              )}
            </div>
          ))
        )}
      </Section>
      <Drawer open={!!fresh} onClose={() => setFresh(null)} title="New invite code">
        {fresh && <CodeReveal {...fresh} />}
      </Drawer>
    </>
  );
}

const blankChild = () => ({ firstName: '', lastName: '', grade: 3, school: '', subjectIds: ['sub_math'] });

function InviteDrawer({ open, onClose }) {
  const show = useResultToast();
  const [form, setForm] = useState({ parentName: '', parentEmail: '', plannedStudents: [blankChild()] });
  const [result, setResult] = useState(null);
  const [create, saving] = useAction(api.invites.createInvite);

  const close = () => {
    onClose();
    setResult(null);
    setForm({ parentName: '', parentEmail: '', plannedStudents: [blankChild()] });
  };
  const setChild = (i, patch) => setForm((f) => ({ ...f, plannedStudents: f.plannedStudents.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));

  return (
    <Drawer
      open={open}
      onClose={close}
      title={result ? 'Invite ready' : 'Invite a family'}
      subtitle={result ? null : 'You’ll get a code to text the parent. Their account unlocks when they enter it.'}
      footer={
        result ? (
          <Button variant="primary" onClick={close}>Done</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close}>Cancel</Button>
            <Button variant="primary" disabled={saving} onClick={async () => {
              const data = show(await create({ ...form, plannedStudents: form.plannedStudents.map((c) => ({ ...c, grade: Number(c.grade) })) }));
              if (data) setResult(data);
            }}>Create code</Button>
          </>
        )
      }
    >
      {result ? (
        <CodeReveal code={result.code} name={result.invite.parentName} expiresAt={result.invite.expiresAt} />
      ) : (
        <div className="space-y-6">
          <div className="space-y-4">
            <Field label="Parent’s name">{(id) => <Input id={id} value={form.parentName} onChange={(e) => setForm({ ...form, parentName: e.target.value })} />}</Field>
            <Field label="Email (optional)" hint="For your records. Nothing is sent yet.">{(id) => <Input id={id} type="email" value={form.parentEmail} onChange={(e) => setForm({ ...form, parentEmail: e.target.value })} />}</Field>
          </div>
          {form.plannedStudents.map((c, i) => (
            <fieldset key={i} className="space-y-4 rounded-lg border border-border p-4">
              <div className="flex items-center justify-between">
                <legend className="text-heading">Child {form.plannedStudents.length > 1 ? i + 1 : ''}</legend>
                {form.plannedStudents.length > 1 && (
                  <button type="button" className="text-small font-medium text-muted-foreground hover:text-critical" onClick={() => setForm((f) => ({ ...f, plannedStudents: f.plannedStudents.filter((_, j) => j !== i) }))}>Remove</button>
                )}
              </div>
              <div className="grid grid-cols-[1fr_1fr_5rem] gap-3">
                <Field label="First name">{(id) => <Input id={id} value={c.firstName} onChange={(e) => setChild(i, { firstName: e.target.value })} />}</Field>
                <Field label="Last name">{(id) => <Input id={id} value={c.lastName} onChange={(e) => setChild(i, { lastName: e.target.value })} />}</Field>
                <Field label="Grade">
                  {(id) => (
                    <Select id={id} value={c.grade} onChange={(e) => setChild(i, { grade: e.target.value })}>
                      {GRADE_OPTIONS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                    </Select>
                  )}
                </Field>
              </div>
              <Field label="School (optional)" hint="A Miami-Dade school name, for your records.">{(id) => <Input id={id} value={c.school} onChange={(e) => setChild(i, { school: e.target.value })} placeholder="Palm Grove Elementary" />}</Field>
            </fieldset>
          ))}
          <Button size="sm" icon={Plus} onClick={() => setForm((f) => ({ ...f, plannedStudents: [...f.plannedStudents, blankChild()] }))}>Add another child</Button>
        </div>
      )}
    </Drawer>
  );
}

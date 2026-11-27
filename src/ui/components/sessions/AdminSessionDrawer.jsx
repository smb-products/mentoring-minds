import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Video } from 'lucide-react';
import { api, useAction, useQuery } from '../../api';
import { fmtDateYear, fmtLongDay, fmtTime, fmtTimeRange, fullName, gradeLabel, mapsUrl } from '../../lib/format';
import { Button } from '../ui/Button';
import { Detail, StatusBadge } from '../ui/Display';
import { CheckRow, Chip, Field, Input, Segmented, Switch, Textarea } from '../ui/Form';
import { Drawer } from '../ui/Overlay';
import { useResultToast } from '../ui/Toast';
import { joinOpen, placeLabel } from './SessionParts';

/** Admin: details for one session + the actions its status allows. view: 'details' | 'complete' | 'decline' | 'cancel' */
export function AdminSessionDrawer({ session, initialView = 'details', onClose }) {
  const [view, setView] = useState(initialView);
  useEffect(() => {
    setView(initialView);
  }, [session?.id, initialView]);
  if (!session) return null;
  const s = session;
  const past = new Date(s.startsAt) < new Date();

  const titles = { details: fullName(s.student), complete: 'Complete session', decline: 'Decline request', cancel: 'Cancel session' };
  return (
    <Drawer open onClose={onClose} title={titles[view]} subtitle={`${fmtLongDay(s.startsAt)}, ${fmtTimeRange(s.startsAt, s.endsAt)}`}>
      {view === 'details' && <Details s={s} past={past} setView={setView} onClose={onClose} />}
      {view === 'complete' && <CompleteForm s={s} onDone={onClose} onBack={() => setView('details')} />}
      {view === 'decline' && <ReasonForm s={s} kind="decline" onDone={onClose} onBack={() => setView('details')} />}
      {view === 'cancel' && <ReasonForm s={s} kind="cancel" onDone={onClose} onBack={() => setView('details')} />}
    </Drawer>
  );
}

function Details({ s, past, setView, onClose }) {
  const show = useResultToast();
  const [confirm, confirming] = useAction(api.scheduling.confirmSession);
  const [noShow] = useAction(api.scheduling.markNoShow);
  const { data: redo = [] } = useQuery(() => api.books.listRedo({ studentId: s.student.id }), [s.student.id]);
  return (
    <div>
      {s.mode === 'VIDEO' && ['CONFIRMED', 'REQUESTED'].includes(s.status) && <VideoPanel s={s} />}
      <dl className="divide-y divide-border">
        <Detail label="Status"><StatusBadge status={s.status} /></Detail>
        <Detail label="Student">{fullName(s.student)}, {gradeLabel(s.student.grade)}</Detail>
        <Detail label="How">{s.mode === 'VIDEO' ? 'Video call, 1-on-1' : 'In person'}</Detail>
        <Detail label="Length">{s.durationMin} minutes</Detail>
        {s.mode !== 'VIDEO' && (
          <Detail label="Where">
            {placeLabel(s)}
            {(s.address || s.location?.address) && (
              <a href={mapsUrl(s.address || s.location.address)} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 text-[13px] hit-area font-bold text-brand hover:underline">
                Open in Maps <ExternalLink size={13} aria-hidden />
              </a>
            )}
          </Detail>
        )}
        {s.callStartedAt && <Detail label="Call">{fmtTime(s.callStartedAt)}{s.callEndedAt ? ` – ${fmtTime(s.callEndedAt)}` : ', in progress'}</Detail>}
        <Detail label="Booked by">{s.requestedBy?.name}</Detail>
        {s.parentNote && <Detail label="Parent’s note">“{s.parentNote}”</Detail>}
        {s.declineReason && <Detail label="Reason">{s.declineReason}</Detail>}
        {s.cancelReason && <Detail label="Reason">{s.cancelReason}</Detail>}
        {redo.length > 0 && s.status === 'CONFIRMED' && (
          <Detail label="Book questions to redo">
            <RedoList items={redo} />
          </Detail>
        )}
      </dl>

      {s.note && (
        <div className="mt-5 rounded-xl border border-border p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[14px] font-extrabold">Session note</p>
            <span className="text-[12.5px] font-bold text-muted-foreground">{s.note.sharedWithParent ? 'Shared with parent' : 'Private'}</span>
          </div>
          <p className="mt-2 text-[14px] leading-relaxed">{s.note.summary}</p>
          {s.note.homework && <p className="mt-2 text-[14px] text-muted-foreground"><span className="font-bold text-foreground">Homework: </span>{s.note.homework}</p>}
          {s.note.skills.length > 0 && <p className="mt-2 text-[13px] font-semibold text-muted-foreground">Skills: {s.note.skills.map((k) => k.name).join(', ')}</p>}
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        {s.status === 'REQUESTED' && (
          <>
            <Button variant="primary" disabled={confirming} onClick={async () => show(await confirm({ sessionId: s.id }), 'Session confirmed', 'The parent has been notified.') && onClose()}>
              Confirm request
            </Button>
            <Button onClick={() => setView('decline')}>Decline</Button>
          </>
        )}
        {s.status === 'CONFIRMED' && past && (
          <>
            <Button variant="primary" onClick={() => setView('complete')}>Complete with note</Button>
            <Button onClick={async () => show(await noShow({ sessionId: s.id }), 'Marked as no-show') && onClose()}>Mark no-show</Button>
          </>
        )}
        {s.status === 'CONFIRMED' && !past && <Button variant="destructive" onClick={() => setView('cancel')}>Cancel session</Button>}
      </div>
    </div>
  );
}

/** Video link, join button and a per-session link change. */
function VideoPanel({ s }) {
  const show = useResultToast();
  const { data: settings } = useQuery(() => api.scheduling.getSettings(), []);
  const [join] = useAction(api.scheduling.joinCall);
  const [setUrl, saving] = useAction(api.scheduling.setMeetingUrl);
  const [editing, setEditing] = useState(false);
  const [url, setUrlText] = useState(s.meetingUrl || '');
  const open = joinOpen(s, settings?.joinOpensMin);
  const link = s.meetingUrl || settings?.defaultMeetingUrl;
  return (
    <div className="mb-4 rounded-xl border border-border bg-muted/50 p-4">
      <p className="flex items-center gap-2 text-[15px] font-extrabold"><Video size={18} className="text-brand" aria-hidden />Video call</p>
      <p className="mt-1 break-all text-[14px] text-muted-foreground">{s.status === 'REQUESTED' ? 'Your video link is sent when you confirm.' : link}</p>
      {s.status === 'CONFIRMED' && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="lg"
            variant="primary"
            icon={Video}
            disabled={!open}
            onClick={async () => {
              const data = show(await join({ sessionId: s.id }));
              if (data) window.open(data.meetingUrl, '_blank', 'noopener');
            }}
          >
            {open ? 'Join call' : `Join opens ${fmtTime(new Date(new Date(s.startsAt).getTime() - (settings?.joinOpensMin ?? 15) * 60000).toISOString())}`}
          </Button>
          <Button size="lg" variant="ghost" onClick={() => setEditing(!editing)}>Use a different link</Button>
        </div>
      )}
      {editing && (
        <form className="mt-3 flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (show(await setUrl({ sessionId: s.id, meetingUrl: url }), 'Link changed for this session')) setEditing(false); }}>
          <Input aria-label="Video link for this session" value={url} onChange={(e) => setUrlText(e.target.value)} placeholder="https://zoom.us/j/…" />
          <Button type="submit" variant="primary" disabled={saving}>Save</Button>
        </form>
      )}
    </div>
  );
}

function RedoList({ items }) {
  const byTest = items.reduce((acc, r) => ({ ...acc, [r.testName]: [...(acc[r.testName] || []), r.item.number] }), {});
  return (
    <span className="tabular">
      {Object.entries(byTest).map(([test, nums]) => (
        <span key={test} className="block">{test}: {nums.map((n) => `#${n}`).join(', ')}</span>
      ))}
    </span>
  );
}

function CompleteForm({ s, onDone, onBack }) {
  const show = useResultToast();
  const { data: subjects = [] } = useQuery(() => api.taxonomy.listSubjects(), []);
  const { data: redo = [] } = useQuery(() => api.books.listRedo({ studentId: s.student.id }), [s.student.id]);
  const skills = useMemo(() => (subjects[0]?.skills ?? []).filter((k) => s.student.grade >= k.gradeMin && s.student.grade <= k.gradeMax), [subjects, s]);
  const [form, setForm] = useState({ attendance: 'PRESENT', summary: '', homework: '', sharedWithParent: true, skillIds: [], clearRedoIds: [] });
  const [complete, saving] = useAction(api.scheduling.completeSession);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const save = async (fields) => {
    if (show(await complete({ sessionId: s.id, ...fields }), 'Session completed', fields.sharedWithParent ? 'Your note is visible to the parent.' : 'Your note is private.')) onDone();
  };

  return (
    <div className="space-y-6">
      <Field label="Attendance">
        <Segmented label="Attendance" value={form.attendance} onChange={(attendance) => set({ attendance })} className="w-full" options={[{ value: 'PRESENT', label: 'Present' }, { value: 'LATE', label: 'Late' }, { value: 'ABSENT', label: 'Absent' }]} />
      </Field>

      <form
        className="space-y-5 border-t border-border pt-5"
        onSubmit={async (e) => {
          e.preventDefault();
          await save(form);
        }}
      >
        <Field label="What you worked on">
          {(id) => <Textarea id={id} rows={4} required value={form.summary} onChange={(e) => set({ summary: e.target.value })} placeholder="Comparing fractions with fraction strips…" />}
        </Field>
        <Field label="Skills covered" hint="These feed the student’s progress report.">
          <div className="flex flex-wrap gap-2">
            {skills.map((k) => (
              <Chip key={k.id} selected={form.skillIds.includes(k.id)} onClick={() => set({ skillIds: form.skillIds.includes(k.id) ? form.skillIds.filter((x) => x !== k.id) : [...form.skillIds, k.id] })}>
                {k.name}
              </Chip>
            ))}
          </div>
        </Field>
        {redo.length > 0 && (
          <Field label="Book questions they got right today" hint="Ticked questions come off the redo list.">
            <div className="divide-y divide-border rounded-xl border border-border">
              {redo.map((r) => (
                <CheckRow key={r.id} checked={form.clearRedoIds.includes(r.id)} onChange={(on) => set({ clearRedoIds: on ? [...form.clearRedoIds, r.id] : form.clearRedoIds.filter((x) => x !== r.id) })} meta={r.item.area.name}>
                  {r.testName} #{r.item.number}
                </CheckRow>
              ))}
            </div>
          </Field>
        )}
        <Field label="Homework (optional)">{(id) => <Input id={id} value={form.homework} onChange={(e) => set({ homework: e.target.value })} />}</Field>
        <Switch checked={form.sharedWithParent} onChange={(sharedWithParent) => set({ sharedWithParent })} label="Share note with parent" description="Turn off to keep this note to yourself." />
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="ghost" onClick={onBack}>Back</Button>
          <Button variant="primary" type="submit" disabled={saving}>Complete session</Button>
        </div>
      </form>
    </div>
  );
}

function ReasonForm({ s, kind, onDone, onBack }) {
  const show = useResultToast();
  const [reason, setReason] = useState('');
  const fn = kind === 'decline' ? api.scheduling.declineSession : api.scheduling.cancelSession;
  const [run, saving] = useAction(fn);
  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (show(await run({ sessionId: s.id, reason }), kind === 'decline' ? 'Request declined' : 'Session cancelled', 'The parent has been notified.')) onDone();
      }}
    >
      <p className="text-[14.5px] leading-relaxed text-muted-foreground">
        {kind === 'decline' ? 'The family will see your reason, so suggest another time if you can.' : 'The family is notified straight away.'}
      </p>
      <Field label="Reason (optional)">{(id) => <Textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={kind === 'decline' ? 'I’m booked then. Could Thursday at 4 work?' : ''} />}</Field>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="ghost" onClick={onBack}>Back</Button>
        <Button variant="primary" type="submit" disabled={saving}>{kind === 'decline' ? 'Decline request' : 'Cancel session'}</Button>
      </div>
    </form>
  );
}

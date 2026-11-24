import { useEffect, useState } from 'react';
import { MessageSquare, Video } from 'lucide-react';
import { api, useAction, useQuery } from '../../api';
import { fmtLongDay, fmtTime, fmtTimeRange } from '../../lib/format';
import { useRouter } from '../../lib/router';
import { Button } from '../ui/Button';
import { Detail, StatusBadge } from '../ui/Display';
import { Field, Textarea } from '../ui/Form';
import { Drawer } from '../ui/Overlay';
import { useResultToast } from '../ui/Toast';
import { joinOpen, placeLabel } from './SessionParts';

/** Parent: one session. Cancel is allowed until the cutoff; after that, message Vienne. */
export function ParentSessionDrawer({ session, onClose }) {
  const { navigate } = useRouter();
  const show = useResultToast();
  const { data: settings } = useQuery(() => api.scheduling.getSettings(), []);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [cancel, busy] = useAction(api.scheduling.cancelSession);
  const [join] = useAction(api.scheduling.joinCall);
  useEffect(() => {
    setCancelling(false);
    setReason('');
  }, [session?.id]);
  if (!session || !settings) return null;

  const s = session;
  const open = ['REQUESTED', 'CONFIRMED'].includes(s.status) && new Date(s.startsAt) > new Date();
  const canCancel = open && new Date(s.startsAt).getTime() - Date.now() > settings.cancelCutoffHours * 3600000;

  return (
    <Drawer open onClose={onClose} title={`${s.student.firstName} with Vienne`} subtitle={`${fmtLongDay(s.startsAt)}, ${fmtTimeRange(s.startsAt, s.endsAt)}`}>
      {cancelling ? (
        <form
          className="space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (show(await cancel({ sessionId: s.id, reason }), 'Session cancelled', 'Vienne has been told.')) onClose();
          }}
        >
          <p className="text-[14.5px] leading-relaxed text-muted-foreground">This frees the time for another family. Vienne gets a notification.</p>
          <Field label="Reason (optional)">{(id) => <Textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="ghost" onClick={() => setCancelling(false)}>Keep session</Button>
            <Button variant="primary" type="submit" disabled={busy}>Cancel session</Button>
          </div>
        </form>
      ) : (
        <>
          {s.mode === 'VIDEO' && s.status === 'CONFIRMED' && open && (
            <div className="mb-4 rounded-xl border border-border bg-muted/50 p-4">
              <p className="flex items-center gap-2 text-[15px] font-extrabold"><Video size={18} className="text-brand" aria-hidden />Video call, 1-on-1</p>
              <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">
                {s.student.firstName} joins on your phone or tablet. You don’t need to stay, but please be nearby. Nothing is recorded.
              </p>
              <Button
                size="lg"
                variant="primary"
                icon={Video}
                className="mt-3 w-full"
                disabled={!joinOpen(s, settings.joinOpensMin) || !s.meetingUrl}
                onClick={async () => {
                  const d = show(await join({ sessionId: s.id }));
                  if (d) window.open(d.meetingUrl, '_blank', 'noopener');
                }}
              >
                {joinOpen(s, settings.joinOpensMin) && s.meetingUrl ? 'Join call' : `Join opens at ${fmtTime(s.joinOpensAt)}`}
              </Button>
            </div>
          )}
          <dl className="divide-y divide-border">
            <Detail label="Status"><StatusBadge status={s.status} label={s.status === 'REQUESTED' ? 'Waiting on Vienne' : undefined} /></Detail>
            <Detail label="For">{s.student.firstName}</Detail>
            <Detail label="How">{s.mode === 'VIDEO' ? 'Video call' : 'In person'}</Detail>
            {s.mode !== 'VIDEO' && <Detail label="Where">{placeLabel(s, { forParent: true })}{s.location?.kind !== 'HOME' && s.location?.address && <span className="block text-[13px] font-semibold text-muted-foreground">{s.location.address}</span>}</Detail>}
            {s.callStartedAt && <Detail label="Call">Started {fmtTime(s.callStartedAt)}{s.callEndedAt ? `, ended ${fmtTime(s.callEndedAt)}` : ''}</Detail>}
            {s.parentNote && <Detail label="Your note">“{s.parentNote}”</Detail>}
            {s.declineReason && <Detail label="From Vienne">{s.declineReason}</Detail>}
          </dl>
          {s.note && (
            <div className="mt-5 rounded-xl border border-border p-4">
              <p className="text-[14px] font-extrabold">Vienne’s note</p>
              <p className="mt-2 text-[14.5px] leading-relaxed">{s.note.summary}</p>
              {s.note.homework && <p className="mt-2 text-[14px] text-muted-foreground"><span className="font-bold text-foreground">Homework: </span>{s.note.homework}</p>}
            </div>
          )}
          {open && (
            <div className="mt-6 space-y-3">
              {canCancel ? (
                <Button variant="destructive" onClick={() => setCancelling(true)}>Cancel session</Button>
              ) : (
                <>
                  <p className="text-[14px] text-muted-foreground">It’s less than {settings.cancelCutoffHours} hours away, so please message Vienne to change it.</p>
                  <Button icon={MessageSquare} onClick={() => navigate('/parent/messages')}>Message Vienne</Button>
                </>
              )}
            </div>
          )}
        </>
      )}
    </Drawer>
  );
}

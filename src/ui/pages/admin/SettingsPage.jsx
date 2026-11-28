'use client';

import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { api, useAction, useQuery } from '../../api';
import { LOCATION_ICON } from '../../components/sessions/SessionParts';
import { Button, IconButton } from '../../components/ui/Button';
import { PageHeader, Section } from '../../components/ui/Display';
import { PageLoading } from '../../components/ui/Display';
import { Chip, Field, Input, Segmented, Select } from '../../components/ui/Form';
import { useShell } from '../../components/shell/ShellContext';
import { useResultToast } from '../../components/ui/Toast';
import { cn } from '../../lib/cn';
import { minutesToLabel } from '../../lib/format';

const toDateInput = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TIME_OPTIONS = Array.from({ length: (21 - 7) * 4 + 1 }, (_, i) => 7 * 60 + i * 15);

/** Data: scheduling.getSettings, getAvailability, listLocations. Writes: updateSettings, setAvailability. */
export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" subtitle="When families can book you, video calls, FAST dates and how the app looks." />
      <div className="grid items-start gap-6 @4xl/page:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <WeeklyHours />
          <FastWindows />
        </div>
        <div className="space-y-6">
          <TextSize />
          <VideoCalls />
          <BookingRules />
          <Locations />
        </div>
      </div>
    </>
  );
}

function WeeklyHours() {
  const show = useResultToast();
  const { data } = useQuery(() => api.scheduling.getAvailability(), []);
  const [rows, setRows] = useState(null);
  const [save, saving] = useAction(api.scheduling.setAvailability);
  useEffect(() => {
    data && setRows(data.map(({ weekday, startMin, endMin, modes }) => ({ weekday, startMin, endMin, modes: modes || ['IN_PERSON'] })));
  }, [data]);
  if (!rows) return <PageLoading />;

  const dirty = JSON.stringify(rows) !== JSON.stringify(data.map(({ weekday, startMin, endMin, modes }) => ({ weekday, startMin, endMin, modes: modes || ['IN_PERSON'] })));
  const toggleMode = (i, mode) => {
    const has = rows[i].modes.includes(mode);
    if (has && rows[i].modes.length === 1) return;
    update(i, { modes: has ? rows[i].modes.filter((m) => m !== mode) : [...rows[i].modes, mode] });
  };
  const update = (i, patch) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <Section
      title="Weekly hours"
      description={`Families can only request times inside these windows. ${(rows.reduce((n, r) => n + (r.endMin - r.startMin), 0) / 60).toFixed(0)} open hours a week.`}
      action={dirty && <Button size="sm" variant="primary" disabled={saving} onClick={async () => show(await save({ rows }), 'Hours saved')}>Save hours</Button>}
    >
      <div className="px-4 py-4 @3xl/page:px-5" aria-hidden>
        <div className="mb-1.5 flex justify-between pl-10 text-caption text-subtle-foreground">
          {[8, 10, 12, 14, 16, 18, 20].map((h) => <span key={h}>{h % 12 || 12}{h < 12 ? 'a' : 'p'}</span>)}
        </div>
        {WEEKDAYS.map((wd) => (
          <div key={wd} className="flex items-center gap-2 py-[3px]">
            <span className="w-8 text-caption text-muted-foreground">{DAY_NAMES[wd].slice(0, 3)}</span>
            <span className="relative h-3.5 flex-1 rounded-xs bg-muted">
              {rows.filter((r) => r.weekday === wd).map((r, i) => (
                <span key={i} className="absolute inset-y-0 rounded-xs bg-primary" style={{ left: `${((r.startMin - 480) / 720) * 100}%`, width: `${((r.endMin - r.startMin) / 720) * 100}%` }} />
              ))}
            </span>
          </div>
        ))}
      </div>
      {WEEKDAYS.map((weekday) => {
        const windows = rows.map((r, i) => ({ ...r, i })).filter((r) => r.weekday === weekday);
        return (
          <div key={weekday} className="flex flex-col gap-2 px-4 py-3 @xl/page:flex-row @xl/page:items-start @3xl/page:px-5">
            <p className={cn('w-28 shrink-0 pt-2 text-body font-medium', !windows.length && 'text-muted-foreground')}>{DAY_NAMES[weekday]}</p>
            <div className="flex flex-1 flex-col gap-2">
              {windows.length === 0 && <p className="pt-2 text-body text-subtle-foreground">Not available</p>}
              {windows.map((w) => (
                <div key={w.i} className="flex flex-wrap items-center gap-2">
                  <Select aria-label="Start" value={w.startMin} onChange={(e) => update(w.i, { startMin: Number(e.target.value) })} className="w-32">
                    {TIME_OPTIONS.map((m) => <option key={m} value={m}>{minutesToLabel(m)}</option>)}
                  </Select>
                  <span className="text-body text-muted-foreground">to</span>
                  <Select aria-label="End" value={w.endMin} onChange={(e) => update(w.i, { endMin: Number(e.target.value) })} className="w-32">
                    {TIME_OPTIONS.map((m) => <option key={m} value={m}>{minutesToLabel(m)}</option>)}
                  </Select>
                  <IconButton size="sm" icon={X} label="Remove window" onClick={() => setRows((r) => r.filter((_, j) => j !== w.i))} />
                  <span className="flex basis-full gap-1.5" role="group" aria-label="Offer">
                    <Chip selected={w.modes.includes('IN_PERSON')} onClick={() => toggleMode(w.i, 'IN_PERSON')}>In person</Chip>
                    <Chip selected={w.modes.includes('VIDEO')} onClick={() => toggleMode(w.i, 'VIDEO')}>Video call</Chip>
                  </span>
                </div>
              ))}
            </div>
            <Button size="xs" variant="ghost" icon={Plus} className="self-start @xl/page:mt-1.5" onClick={() => setRows((r) => [...r, { weekday, startMin: 15 * 60, endMin: 18 * 60, modes: ['IN_PERSON', 'VIDEO'] }])}>
              Add hours
            </Button>
          </div>
        );
      })}
    </Section>
  );
}

/** Bigger text and buttons for this account. Stored on the user, applied app-wide. */
function TextSize() {
  const show = useResultToast();
  const { user } = useShell();
  const [save] = useAction(api.families.setTextSize);
  return (
    <Section title="Text size" description="Makes words and buttons bigger everywhere in the app, on this account.">
      <div className="p-4 @3xl/page:p-5">
        <Segmented
          label="Text size"
          value={user.textSize || 'NORMAL'}
          onChange={async (textSize) => show(await save({ textSize }), 'Text size changed')}
          className="w-full"
          options={[{ value: 'NORMAL', label: 'Normal' }, { value: 'LARGE', label: 'Large' }, { value: 'XLARGE', label: 'Extra large' }]}
        />
      </div>
    </Section>
  );
}

function VideoCalls() {
  const show = useResultToast();
  const { data } = useQuery(() => api.scheduling.getSettings(), []);
  const [form, setForm] = useState(null);
  const [save, saving] = useAction(api.scheduling.updateSettings);
  useEffect(() => {
    data && setForm({ defaultMeetingUrl: data.defaultMeetingUrl || '', joinOpensMin: data.joinOpensMin });
  }, [data]);
  if (!form) return null;
  const dirty = form.defaultMeetingUrl !== (data.defaultMeetingUrl || '') || Number(form.joinOpensMin) !== data.joinOpensMin;
  return (
    <Section
      title="Video calls"
      description="Video sessions are 1-on-1. The child joins from their parent’s phone or tablet."
      action={dirty && <Button size="sm" variant="primary" disabled={saving} onClick={async () => show(await save({ defaultMeetingUrl: form.defaultMeetingUrl, joinOpensMin: Number(form.joinOpensMin) }), 'Video settings saved')}>Save</Button>}
    >
      <div className="space-y-4 p-4 @3xl/page:p-5">
        <Field label="Your video link" hint="Your Google Meet or Zoom room. Families only see it when the call is about to start.">
          {(id) => <Input id={id} value={form.defaultMeetingUrl} onChange={(e) => setForm({ ...form, defaultMeetingUrl: e.target.value })} placeholder="https://meet.google.com/…" />}
        </Field>
        <Field label="Join button appears">
          {(id) => (
            <Select id={id} value={form.joinOpensMin} onChange={(e) => setForm({ ...form, joinOpensMin: e.target.value })}>
              {[5, 10, 15, 30].map((m) => <option key={m} value={m}>{m} minutes before</option>)}
            </Select>
          )}
        </Field>
      </div>
    </Section>
  );
}

function FastWindows() {
  const show = useResultToast();
  const { data } = useQuery(() => api.scheduling.getSettings(), []);
  const [rows, setRows] = useState(null);
  const [save, saving] = useAction(api.scheduling.updateSettings);
  useEffect(() => {
    data && setRows(data.fastWindows.map((w) => ({ ...w, start: toDateInput(w.startsAt), end: toDateInput(w.endsAt) })));
  }, [data]);
  if (!rows) return null;
  const dirty = rows.some((r, i) => r.start !== toDateInput(data.fastWindows[i].startsAt) || r.end !== toDateInput(data.fastWindows[i].endsAt));
  return (
    <Section
      title="FAST testing dates"
      description="Copy these from the Miami-Dade testing calendar. Today shows a countdown to the next one."
      action={dirty && <Button size="sm" variant="primary" disabled={saving} onClick={async () => show(await save({ fastWindows: rows.map((r) => ({ window: r.window, schoolYear: r.schoolYear, startsAt: new Date(`${r.start}T00:00`).toISOString(), endsAt: new Date(`${r.end}T23:59`).toISOString() })) }), 'Testing dates saved')}>Save dates</Button>}
    >
      {rows.map((r, i) => (
        <div key={r.window} className="grid grid-cols-[4rem_minmax(0,1fr)_minmax(0,1fr)] items-end gap-3 px-4 py-3 @3xl/page:px-5">
          <p className="pb-2.5 text-heading">{r.window}</p>
          <Field label="Starts">{(id) => <Input id={id} type="date" value={r.start} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />}</Field>
          <Field label="Ends">{(id) => <Input id={id} type="date" value={r.end} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} />}</Field>
        </div>
      ))}
    </Section>
  );
}

const RULES = [
  { key: 'minNoticeHours', label: 'Notice needed', unit: 'hours', hint: 'How far ahead families must request.' },
  { key: 'cancelCutoffHours', label: 'Cancel up to', unit: 'hours before', hint: 'After this, families message you instead.' },
  { key: 'horizonWeeks', label: 'Book ahead', unit: 'weeks', hint: 'How far into the future families can book.' },
];

function BookingRules() {
  const show = useResultToast();
  const { data } = useQuery(() => api.scheduling.getSettings(), []);
  const [form, setForm] = useState(null);
  const [save, saving] = useAction(api.scheduling.updateSettings);
  useEffect(() => {
    data && setForm(data);
  }, [data]);
  if (!form) return <PageLoading />;
  const dirty = RULES.some((r) => Number(form[r.key]) !== data[r.key]);

  return (
    <Section
      title="Booking rules"
      description={`Sessions are ${data.sessionLengths.join(', ')} minutes.`}
      action={dirty && <Button size="sm" variant="primary" disabled={saving} onClick={async () => show(await save(Object.fromEntries(RULES.map((r) => [r.key, Number(form[r.key])]))), 'Rules saved')}>Save rules</Button>}
    >
      {RULES.map((r) => (
        <div key={r.key} className="flex items-center gap-4 px-4 py-3 @3xl/page:px-5">
          <div className="min-w-0 flex-1">
            <label htmlFor={r.key} className="text-body font-medium">{r.label}</label>
            <p className="text-small text-muted-foreground">{r.hint}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-20"><Input id={r.key} type="number" min={0} value={form[r.key]} onChange={(e) => setForm({ ...form, [r.key]: e.target.value })} className="tabular text-right" /></div>
            <span className="w-24 text-small text-muted-foreground">{r.unit}</span>
          </div>
        </div>
      ))}
    </Section>
  );
}

function Locations() {
  const { data: locations = [] } = useQuery(() => api.scheduling.listLocations(), []);
  return (
    <Section title="Locations" description="Where families can choose to meet.">
      {locations.map((l) => {
        const Icon = LOCATION_ICON[l.kind];
        return (
          <div key={l.id} className="flex items-center gap-3 px-4 py-3 @3xl/page:px-5">
            <Icon size={18} className="shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0">
              <p className="text-body font-medium">{l.name}</p>
              <p className="text-small text-muted-foreground">{l.kind === 'HOME' ? 'The family adds their address when booking.' : l.address}</p>
            </div>
          </div>
        );
      })}
    </Section>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { api, useAction, useQuery } from '../../api';
import { fullName, gradeLabel } from '../../lib/format';
import { Button } from '../ui/Button';
import { Field, Input, Segmented, Select } from '../ui/Form';
import { Drawer } from '../ui/Overlay';
import { useResultToast } from '../ui/Toast';

const toLocalDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Admin: book a session directly (phone / in-person bookings). Calls scheduling.createSessionAsAdmin. */
export function AddSessionDrawer({ open, onClose, defaultDate }) {
  const show = useResultToast();
  const { data: families = [] } = useQuery(() => api.families.listFamilies({ status: 'ACTIVE' }), []);
  const { data: locations = [] } = useQuery(() => api.scheduling.listLocations(), []);
  const students = useMemo(() => families.flatMap((f) => f.students.map((s) => ({ ...s, parentName: f.name }))), [families]);
  const [form, setForm] = useState({ studentId: '', mode: 'IN_PERSON', date: '', time: '16:00', durationMin: 45, locationId: 'loc_studio', address: '' });
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const [create, saving] = useAction(api.scheduling.createSessionAsAdmin);

  useEffect(() => {
    if (open) set({ date: toLocalDate(defaultDate ? new Date(defaultDate) : new Date(Date.now() + 86400000)) });
  }, [open, defaultDate]);

  const student = students.find((s) => s.id === form.studentId);
  const location = locations.find((l) => l.id === form.locationId);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Add session"
      subtitle="For sessions booked by phone or in person. It’s confirmed straight away."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={saving || !form.studentId}
            onClick={async () => {
              const startsAt = new Date(`${form.date}T${form.time}`).toISOString();
              const res = await create({ studentId: form.studentId, mode: form.mode, locationId: form.locationId, address: form.address, startsAt, durationMin: form.durationMin });
              if (show(res, 'Session added', `${student.firstName}’s family has been notified.`)) onClose();
            }}
          >
            Add session
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Student">
          {(id) => (
            <Select id={id} value={form.studentId} onChange={(e) => set({ studentId: e.target.value })}>
              <option value="">Choose a student</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{fullName(s)}, {gradeLabel(s.grade)}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="How">
          <Segmented label="How" value={form.mode} onChange={(mode) => set({ mode })} className="w-full" options={[{ value: 'IN_PERSON', label: 'In person' }, { value: 'VIDEO', label: 'Video call' }]} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">{(id) => <Input id={id} type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} />}</Field>
          <Field label="Start time">{(id) => <Input id={id} type="time" step={900} value={form.time} onChange={(e) => set({ time: e.target.value })} />}</Field>
        </div>
        <Field label="Length">
          <Segmented label="Length" value={form.durationMin} onChange={(durationMin) => set({ durationMin })} className="w-full" options={[30, 45, 60].map((m) => ({ value: m, label: `${m} min` }))} />
        </Field>
        {form.mode === 'IN_PERSON' ? (
          <>
            <Field label="Location">
              {(id) => (
                <Select id={id} value={form.locationId} onChange={(e) => set({ locationId: e.target.value })}>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </Select>
              )}
            </Field>
            {location?.kind === 'HOME' && <Field label="Home address">{(id) => <Input id={id} value={form.address} onChange={(e) => set({ address: e.target.value })} placeholder="Street address" />}</Field>}
          </>
        ) : (
          <p className="rounded-lg bg-muted px-3 py-2.5 text-[14px] text-muted-foreground">Uses your video link from Settings. You can change it for this session afterwards.</p>
        )}
      </div>
    </Drawer>
  );
}

/** server/scheduling — availability, open slots, and the session lifecycle (plan §6). */
import { action, ApiError, commit, getDb, need, newId, nowIso, requireAdmin, requireStudentAccess, requireUser } from '../core';
import { sessionDTO, sessionForParent } from '../dto';
import { notify, notifyAdmins } from './notifications';

const MIN = 60000;
const HOLDS_SLOT = ['REQUESTED', 'CONFIRMED'];
const t = (iso) => new Date(iso).getTime();

/* ── Settings & availability ── */
export async function getSettings() {
  requireUser();
  return { ...getDb().settings };
}
export const updateSettings = action(async (patch) => {
  requireAdmin();
  const numbers = ['minNoticeHours', 'cancelCutoffHours', 'horizonWeeks', 'slotStepMin', 'joinOpensMin'];
  const allowed = [...numbers, 'sessionLengths', 'defaultMeetingUrl', 'fastWindows'];
  Object.keys(patch).forEach((k) => need(allowed.includes(k), `Unknown setting: ${k}`));
  Object.entries(patch).forEach(([k, v]) => numbers.includes(k) && need(Number.isInteger(v) && v >= 0, `${k} must be a whole number`));
  if (patch.defaultMeetingUrl) need(/^https:\/\//.test(patch.defaultMeetingUrl), 'The video link should start with https://');
  (patch.fastWindows || []).forEach((w) => need(t(w.endsAt) > t(w.startsAt), `${w.window} must end after it starts`));
  return commit((db) => Object.assign(db.settings, patch));
});

export async function getAvailability() {
  requireUser();
  return [...getDb().availability].sort((a, b) => a.weekday - b.weekday || a.startMin - b.startMin);
}
/** Replaces the whole weekly schedule. rows: [{ weekday, startMin, endMin, modes: ['IN_PERSON' | 'VIDEO'] }] */
export const setAvailability = action(async ({ rows }) => {
  requireAdmin();
  rows.forEach((r) => need(r.endMin > r.startMin, 'End time must be after start time'));
  rows.forEach((r) => need(!r.modes || r.modes.length, 'Each block needs in person, video, or both'));
  return commit((db) => {
    db.availability = rows.map((r) => ({ id: newId('av'), weekday: r.weekday, startMin: r.startMin, endMin: r.endMin, modes: r.modes || ['IN_PERSON', 'VIDEO'] }));
    return db.availability;
  });
});

export async function listTimeOff() {
  requireUser();
  return [...getDb().timeOff].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
export const addTimeOff = action(async ({ startsAt, endsAt, reason }) => {
  requireAdmin();
  need(t(endsAt) > t(startsAt), 'Time off must end after it starts');
  return commit((db) => {
    const row = { id: newId('to'), startsAt, endsAt, reason: reason || null };
    db.timeOff.push(row);
    return row;
  });
});
export const removeTimeOff = action(async ({ timeOffId }) => {
  requireAdmin();
  commit((db) => (db.timeOff = db.timeOff.filter((x) => x.id !== timeOffId)));
});

export async function listLocations() {
  requireUser();
  return getDb().locations.filter((l) => l.active);
}

/* ── Open slots ── */
/**
 * A time is taken only by Vienne's time off and by the session time itself
 * (requested or confirmed). No travel time is added before or after any session.
 */
function conflicts(db, startMs, endMs, _where, ignoreId) {
  if (db.timeOff.some((o) => startMs < t(o.endsAt) && endMs > t(o.startsAt))) return true;
  return db.sessions.some((s) => s.id !== ignoreId && HOLDS_SLOT.includes(s.status) && startMs < t(s.endsAt) && endMs > t(s.startsAt));
}

/**
 * Open start times for a request.
 * @returns {Promise<{ startsAt: string, endsAt: string }[]>}
 */
export async function getOpenSlots({ durationMin, mode = 'IN_PERSON', locationId, address, from, to }) {
  requireUser();
  const db = getDb();
  const s = db.settings;
  need(s.sessionLengths.includes(durationMin), 'Pick 30, 45 or 60 minutes');
  const earliest = Date.now() + s.minNoticeHours * 3600000;
  const latest = Date.now() + s.horizonWeeks * 7 * 86400000;
  const slots = [];
  const day = new Date(from);
  day.setHours(0, 0, 0, 0);
  for (; day.getTime() <= t(to); day.setDate(day.getDate() + 1)) {
    db.availability
      .filter((a) => a.weekday === day.getDay() && (a.modes || ['IN_PERSON']).includes(mode))
      .forEach((a) => {
        for (let m = a.startMin; m + durationMin <= a.endMin; m += s.slotStepMin) {
          const start = new Date(day);
          start.setHours(0, m, 0, 0);
          const startMs = start.getTime();
          const endMs = startMs + durationMin * MIN;
          if (startMs < earliest || startMs > latest) continue;
          if (conflicts(db, startMs, endMs, { mode, locationId, address })) continue;
          slots.push({ startsAt: new Date(startMs).toISOString(), endsAt: new Date(endMs).toISOString() });
        }
      });
  }
  return slots;
}

/* ── Reads ── */
export async function listSessions({ from, to, studentId, status } = {}) {
  const user = requireUser();
  const db = getDb();
  let rows = db.sessions;
  if (user.role !== 'ADMIN') {
    const mine = db.students.filter((s) => s.parentId === user.id).map((s) => s.id);
    rows = rows.filter((s) => mine.includes(s.studentId));
  }
  if (studentId) rows = rows.filter((s) => s.studentId === studentId);
  if (status) rows = rows.filter((s) => (Array.isArray(status) ? status : [status]).includes(s.status));
  if (from) rows = rows.filter((s) => t(s.endsAt) >= t(from));
  if (to) rows = rows.filter((s) => t(s.startsAt) <= t(to));
  rows = [...rows].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return rows.map(user.role === 'ADMIN' ? sessionDTO : sessionForParent);
}

/* ── Lifecycle ── */
const label = (db, s) => {
  const st = db.students.find((x) => x.id === s.studentId);
  const where = s.mode === 'VIDEO' ? 'video call' : db.locations.find((l) => l.id === s.locationId)?.name;
  return { st, text: `${st.firstName}, ${s.durationMin} min, ${where}` };
};

/** Validates mode/location/address and returns the stored fields. */
function placeFields(db, { mode = 'IN_PERSON', locationId, address }) {
  need(['IN_PERSON', 'VIDEO'].includes(mode), 'Choose in person or video call');
  if (mode === 'VIDEO') return { mode, locationId: null, address: null };
  const loc = db.locations.find((l) => l.id === locationId);
  need(loc, 'Choose a location');
  need(loc.kind !== 'HOME' || address, 'Add the address for a home visit');
  return { mode, locationId, address: loc.kind === 'HOME' ? address : null };
}
const offersMode = (db, startMs, endMs, mode) => {
  const d = new Date(startMs);
  const m = d.getHours() * 60 + d.getMinutes();
  return db.availability.some((a) => a.weekday === d.getDay() && (a.modes || ['IN_PERSON']).includes(mode) && m >= a.startMin && m + (endMs - startMs) / MIN <= a.endMin);
};

export const requestSession = action(async ({ studentId, mode, locationId, address, startsAt, durationMin, parentNote }) => {
  const user = requireStudentAccess(studentId);
  return commit((db) => {
    const place = placeFields(db, { mode, locationId, address });
    const startMs = t(startsAt);
    const endMs = startMs + durationMin * MIN;
    need(startMs >= Date.now() + db.settings.minNoticeHours * 3600000, `Sessions need ${db.settings.minNoticeHours} hours’ notice`);
    need(offersMode(db, startMs, endMs, place.mode), place.mode === 'VIDEO' ? 'Vienne doesn’t offer video calls at that time' : 'Vienne isn’t available at that time');
    if (conflicts(db, startMs, endMs, place)) throw new ApiError('SLOT_TAKEN', 'That time was just booked. Pick another.');
    const now = nowIso();
    const session = {
      id: newId('ses'), studentId, subjectId: 'sub_math', ...place, meetingUrl: null, requestedById: user.id,
      startsAt: new Date(startMs).toISOString(), endsAt: new Date(endMs).toISOString(), durationMin, status: 'REQUESTED',
      parentNote: parentNote || null, declineReason: null, confirmedAt: null, cancelledById: null, cancelledAt: null, cancelReason: null,
      callStartedAt: null, callEndedAt: null, reminderSentAt: null, createdAt: now, updatedAt: now,
    };
    db.sessions.push(session);
    const { text } = label(db, session);
    notifyAdmins({ type: 'SESSION_REQUESTED', title: `New request from ${user.name}`, body: text, href: '/admin/schedule' });
    return sessionDTO(session);
  });
});

function findSession(db, sessionId) {
  const s = db.sessions.find((x) => x.id === sessionId);
  need(s, 'Session not found');
  return s;
}

export const confirmSession = action(async ({ sessionId }) => {
  requireAdmin();
  return commit((db) => {
    const s = findSession(db, sessionId);
    need(s.status === 'REQUESTED', 'Only requests can be confirmed');
    if (conflicts(db, t(s.startsAt), t(s.endsAt), s, s.id)) throw new ApiError('SLOT_TAKEN', 'This overlaps another session.');
    if (s.mode === 'VIDEO') need(s.meetingUrl || db.settings.defaultMeetingUrl, 'Add your video link in Settings first');
    Object.assign(s, { status: 'CONFIRMED', confirmedAt: nowIso(), updatedAt: nowIso(), ...(s.mode === 'VIDEO' && { meetingUrl: s.meetingUrl || db.settings.defaultMeetingUrl }) });
    const { st, text } = label(db, s);
    // The video link is part of the confirmation, not a separate notification.
    const body = s.mode === 'VIDEO' ? `${text}. The Join call button appears ${db.settings.joinOpensMin} minutes before.` : text;
    notify({ userId: st.parentId, audience: 'PARENT', type: 'SESSION_CONFIRMED', title: `Vienne confirmed ${st.firstName}’s session`, body, href: '/parent/sessions' });
    return sessionDTO(s);
  });
});

export const declineSession = action(async ({ sessionId, reason }) => {
  requireAdmin();
  return commit((db) => {
    const s = findSession(db, sessionId);
    need(s.status === 'REQUESTED', 'Only requests can be declined');
    Object.assign(s, { status: 'DECLINED', declineReason: reason || null, updatedAt: nowIso() });
    const { st, text } = label(db, s);
    notify({ userId: st.parentId, audience: 'PARENT', type: 'SESSION_DECLINED', title: `Vienne couldn’t take ${st.firstName}’s request`, body: reason || text, href: '/parent/sessions' });
    return sessionDTO(s);
  });
});

export const cancelSession = action(async ({ sessionId, reason }) => {
  const user = requireUser();
  return commit((db) => {
    const s = findSession(db, sessionId);
    need(['REQUESTED', 'CONFIRMED'].includes(s.status), 'This session can’t be cancelled');
    const { st, text } = label(db, s);
    if (user.role !== 'ADMIN') {
      requireStudentAccess(s.studentId);
      const cutoff = t(s.startsAt) - db.settings.cancelCutoffHours * 3600000;
      if (Date.now() > cutoff) throw new ApiError('PAST_CUTOFF', `Less than ${db.settings.cancelCutoffHours} hours to go. Message Vienne instead.`);
    }
    Object.assign(s, { status: 'CANCELLED', cancelledById: user.id, cancelledAt: nowIso(), cancelReason: reason || null, updatedAt: nowIso() });
    if (user.role === 'ADMIN') {
      notify({ userId: st.parentId, audience: 'PARENT', type: 'SESSION_CHANGED', title: `Vienne cancelled ${st.firstName}’s session`, body: reason || text, href: '/parent/sessions' });
    } else {
      notifyAdmins({ type: 'SESSION_CANCELLED_BY_PARENT', title: `${user.name} cancelled a session`, body: reason ? `${text}. ${reason}` : text, href: '/admin/schedule' });
    }
    return sessionDTO(s);
  });
});

export const rescheduleSession = action(async ({ sessionId, startsAt, durationMin }) => {
  requireAdmin();
  return commit((db) => {
    const s = findSession(db, sessionId);
    const dur = durationMin ?? s.durationMin;
    const startMs = t(startsAt);
    if (conflicts(db, startMs, startMs + dur * MIN, s, s.id)) throw new ApiError('SLOT_TAKEN', 'That overlaps another session.');
    Object.assign(s, { startsAt: new Date(startMs).toISOString(), endsAt: new Date(startMs + dur * MIN).toISOString(), durationMin: dur, updatedAt: nowIso() });
    const { st, text } = label(db, s);
    notify({ userId: st.parentId, audience: 'PARENT', type: 'SESSION_CHANGED', title: `Vienne moved ${st.firstName}’s session`, body: text, href: '/parent/sessions' });
    return sessionDTO(s);
  });
});

export const createSessionAsAdmin = action(async ({ studentId, mode, locationId, address, meetingUrl, startsAt, durationMin }) => {
  const admin = requireAdmin();
  return commit((db) => {
    const place = placeFields(db, { mode, locationId, address });
    const startMs = t(startsAt);
    const endMs = startMs + durationMin * MIN;
    if (conflicts(db, startMs, endMs, place)) throw new ApiError('SLOT_TAKEN', 'That overlaps another session.');
    const now = nowIso();
    const session = {
      id: newId('ses'), studentId, subjectId: 'sub_math', ...place, meetingUrl: place.mode === 'VIDEO' ? meetingUrl || db.settings.defaultMeetingUrl : null, requestedById: admin.id,
      startsAt: new Date(startMs).toISOString(), endsAt: new Date(endMs).toISOString(), durationMin, status: 'CONFIRMED', parentNote: null,
      declineReason: null, confirmedAt: now, cancelledById: null, cancelledAt: null, cancelReason: null, callStartedAt: null, callEndedAt: null, reminderSentAt: null, createdAt: now, updatedAt: now,
    };
    db.sessions.push(session);
    const { st, text } = label(db, session);
    notify({ userId: st.parentId, audience: 'PARENT', type: 'SESSION_CONFIRMED', title: `New session booked for ${st.firstName}`, body: text, href: '/parent/sessions' });
    return sessionDTO(session);
  });
});

/**
 * Saves the note. `redoItemIds` are book questions to add to the student's redo list;
 * `clearRedoIds` are ones they got right today. `source` is VOICE when Vienne used
 * "Talk about it" and accepted the draft (`aiDraftId`).
 */
export const completeSession = action(async ({ sessionId, attendance, summary, homework, sharedWithParent = true, skillIds = [], redoItemIds = [], clearRedoIds = [], source = 'TYPED', aiDraftId = null }) => {
  requireAdmin();
  need(summary?.trim(), 'Add a short summary');
  return commit((db) => {
    const s = findSession(db, sessionId);
    need(s.status === 'CONFIRMED', 'Only confirmed sessions can be completed');
    const now = nowIso();
    const noteId = newId('note');
    db.sessionNotes.push({ id: noteId, sessionId, attendance, summary: summary.trim(), homework: homework || null, sharedWithParent, source, createdAt: now, updatedAt: now });
    skillIds.forEach((skillId) => db.sessionNoteSkills.push({ sessionNoteId: noteId, skillId }));
    redoItemIds.forEach((bookItemId) => {
      if (db.redoItems.some((r) => r.studentId === s.studentId && r.bookItemId === bookItemId && !r.clearedAt)) return;
      db.redoItems.push({ id: newId('redo'), studentId: s.studentId, bookItemId, source: 'SESSION', submissionId: null, createdAt: now, clearedAt: null });
    });
    db.redoItems.forEach((r) => clearRedoIds.includes(r.id) && (r.clearedAt = now));
    if (aiDraftId) {
      const draft = db.aiDrafts.find((d) => d.id === aiDraftId);
      if (draft) Object.assign(draft, { status: 'ACCEPTED', decidedAt: now });
    }
    Object.assign(s, { status: 'COMPLETED', updatedAt: now, ...(s.mode === 'VIDEO' && s.callStartedAt && !s.callEndedAt && { callEndedAt: now }) });
    return sessionDTO(s);
  });
});

export const markNoShow = action(async ({ sessionId }) => {
  requireAdmin();
  return commit((db) => {
    const s = findSession(db, sessionId);
    Object.assign(s, { status: 'NO_SHOW', updatedAt: nowIso() });
    return sessionDTO(s);
  });
});

/** Records that the call was opened (Vienne or the family pressed Join). Shown in the parent's session history. */
export const joinCall = action(async ({ sessionId }) => {
  const user = requireUser();
  return commit((db) => {
    const s = findSession(db, sessionId);
    if (user.role !== 'ADMIN') requireStudentAccess(s.studentId);
    need(s.mode === 'VIDEO' && s.status === 'CONFIRMED', 'This isn’t a video session');
    const opens = t(s.startsAt) - db.settings.joinOpensMin * MIN;
    need(Date.now() >= opens && Date.now() <= t(s.endsAt), `The call opens ${db.settings.joinOpensMin} minutes before the start`);
    if (!s.callStartedAt) s.callStartedAt = nowIso();
    return { meetingUrl: s.meetingUrl };
  });
});

/** Vienne can paste a different link for one session. */
export const setMeetingUrl = action(async ({ sessionId, meetingUrl }) => {
  requireAdmin();
  need(/^https:\/\//.test(meetingUrl || ''), 'The video link should start with https://');
  return commit((db) => sessionDTO(Object.assign(findSession(db, sessionId), { meetingUrl, updatedAt: nowIso() })));
});

/**
 * Demo seed (backend plan §13, ADDITIONS.md). Collections mirror Prisma models 1:1.
 * Math only, Miami-Dade families, the Florida Test Prep F.A.S.T. book per grade,
 * FAST / Star Math results and optional video sessions.
 * Join tables are explicit arrays (studentSubjects, sessionNoteSkills, resourceTags).
 * Dates are ISO strings relative to "now" so the demo always looks current.
 */
import { codesForGrade, isFastGrade } from '../../src/ui/api/best.js';

const DAY = 86400000;
const H = 3600000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const plus = (iso, min) => new Date(new Date(iso).getTime() + min * 60000).toISOString();
const at = (dayOffset, hour, minute = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};
/** The date of `weekday` (0 = Sun) in the week `weekOffset` weeks from now (Mon-start weeks). */
function dayInWeek(weekOffset, weekday) {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  return new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + weekOffset * 7 + ((weekday + 6) % 7));
}
const dateAt = (base, hour, minute = 0) => {
  const d = new Date(base);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};

let r = 11;
const rand = () => ((r = (r * 16807) % 2147483647) - 1) / 2147483646;
const pick = (list) => list[Math.floor(rand() * list.length)];

/** Demo code hashing. Production uses SHA-256 + pepper. */
export const hashCode = (code) => `h_${[...code.toUpperCase()].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7)}`;

export const MEETING_URL = 'https://meet.google.com/mmv-tutr-room';
export const BOOK_TITLE = 'Florida Test Prep F.A.S.T. Mathematics';

export function createSeed() {
  r = 11; // same demo data on every call (tests reset to it many times in one run)
  /* ── People ─────────────────────────────────────────────── */
  const U = (id, name, phone, days, extra = {}) => ({
    id, email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`, emailVerified: ago(days * DAY), name, phone, image: null,
    passwordHash: 'set', role: 'PARENT', status: 'ACTIVE', textSize: 'NORMAL', createdAt: ago(days * DAY), updatedAt: ago(2 * DAY), ...extra,
  });
  const users = [
    U('u_admin', 'Vienne Elliott', '(305) 555-0142', 120, { email: 'vienne@example.com', role: 'ADMIN', textSize: 'LARGE' }),
    U('u_monique', 'Monique Johnson', '(305) 555-0187', 90, { passwordHash: null }),
    U('u_daniel', 'Daniel Reyes', '(786) 555-0119', 75),
    U('u_priya', 'Priya Patel', '(305) 555-0163', 60, { passwordHash: null }),
    U('u_keisha', 'Keisha Brooks', '(786) 555-0135', 6),
    U('u_ana', 'Ana Mendoza', '(305) 555-0172', 50),
    U('u_grace', 'Grace Kim', '(786) 555-0110', 44),
    U('u_marcus', 'Marcus Thompson', '(305) 555-0193', 40),
    U('u_fatima', 'Fatima Ali', '(786) 555-0128', 33),
    U('u_hannah', 'Hannah Wells', '(305) 555-0156', 30),
    U('u_david', 'David Okafor', '(786) 555-0141', 46),
    U('u_tom', 'Tom Hughes', null, 2, { status: 'PREVIEW', emailVerified: null }),
    U('u_lena', 'Lena Fischer', null, 1, { status: 'PREVIEW', emailVerified: null, passwordHash: null }),
  ];

  const subjects = [{ id: 'sub_math', name: 'Math', color: 'chart-1', order: 0, archivedAt: null }];

  /* Vienne's teaching skills. Each maps to a B.E.S.T. strand and, for grades 3–6, to benchmark codes. */
  const K = (id, name, strand, gradeMin, gradeMax, benchmarkCodes = []) => ({ id, subjectId: 'sub_math', name, strand, gradeMin, gradeMax, benchmarkCodes, archivedAt: null });
  const skills = [
    K('sk_counting', 'Counting and number sense', 'NSO', 0, 1),
    K('sk_add_sub', 'Adding and subtracting', 'NSO', 0, 3, ['MA.3.NSO.2.1', 'MA.3.AR.1.2']),
    K('sk_place_value', 'Place value', 'NSO', 1, 5, ['MA.3.NSO.1.1', 'MA.3.NSO.1.2', 'MA.3.NSO.1.3', 'MA.3.NSO.1.4', 'MA.4.NSO.1.1', 'MA.4.NSO.1.2', 'MA.5.NSO.1.1']),
    K('sk_mult_div', 'Multiplying and dividing', 'NSO', 2, 5, ['MA.3.NSO.2.2', 'MA.3.NSO.2.3', 'MA.3.NSO.2.4', 'MA.3.AR.1.1', 'MA.4.NSO.2.3', 'MA.4.NSO.2.4', 'MA.5.NSO.2.1', 'MA.5.NSO.2.2']),
    K('sk_fractions', 'Fractions', 'FR', 1, 6, ['MA.3.FR.1.1', 'MA.3.FR.1.2', 'MA.3.FR.1.3', 'MA.3.FR.2.1', 'MA.3.FR.2.2', 'MA.4.FR.1.1', 'MA.4.FR.1.2', 'MA.4.FR.1.3', 'MA.4.FR.1.4', 'MA.4.FR.2.1', 'MA.4.FR.2.2', 'MA.4.FR.2.3', 'MA.5.FR.1.1', 'MA.5.FR.2.1', 'MA.5.FR.2.2', 'MA.5.FR.2.3', 'MA.5.FR.2.4', 'MA.6.NSO.2.1', 'MA.6.NSO.2.2', 'MA.6.NSO.2.3']),
    K('sk_decimals', 'Decimals', 'NSO', 4, 6, ['MA.4.NSO.2.6', 'MA.5.NSO.2.3', 'MA.5.NSO.2.4', 'MA.5.NSO.2.5']),
    K('sk_patterns', 'Patterns and equations', 'AR', 1, 6, ['MA.3.AR.2.2', 'MA.3.AR.3.1', 'MA.4.AR.2.1', 'MA.4.AR.3.1', 'MA.5.AR.2.1', 'MA.5.AR.2.2', 'MA.5.AR.2.3', 'MA.5.AR.3.1', 'MA.6.AR.1.1', 'MA.6.AR.2.1', 'MA.6.AR.2.2']),
    K('sk_ratios', 'Ratios and rates', 'AR', 6, 6, ['MA.6.AR.3.1', 'MA.6.AR.3.2', 'MA.6.AR.3.3', 'MA.6.AR.3.4', 'MA.6.AR.3.5']),
    K('sk_integers', 'Integers and exponents', 'NSO', 6, 6, ['MA.6.NSO.1.2', 'MA.6.NSO.1.3', 'MA.6.NSO.1.4', 'MA.6.NSO.3.1', 'MA.6.NSO.3.2']),
    K('sk_measurement', 'Measurement and time', 'M', 0, 5, ['MA.3.M.1.1', 'MA.3.M.1.2', 'MA.3.M.2.1', 'MA.3.M.2.2', 'MA.4.M.1.1', 'MA.4.M.1.2', 'MA.4.M.2.1', 'MA.5.M.1.1']),
    K('sk_geometry', 'Geometry, area and volume', 'GR', 0, 6, ['MA.3.GR.1.1', 'MA.3.GR.2.1', 'MA.3.GR.2.2', 'MA.4.GR.1.1', 'MA.4.GR.2.1', 'MA.4.GR.2.2', 'MA.5.GR.1.1', 'MA.5.GR.3.1', 'MA.5.GR.3.2', 'MA.6.GR.2.1', 'MA.6.GR.2.2']),
    K('sk_data', 'Data and graphs', 'DP', 0, 6, ['MA.3.DP.1.1', 'MA.3.DP.1.2', 'MA.4.DP.1.1', 'MA.4.DP.1.2', 'MA.5.DP.1.1', 'MA.5.DP.1.2', 'MA.6.DP.1.1', 'MA.6.DP.1.3']),
    K('sk_word_problems', 'Word problems', 'AR', 1, 6, ['MA.3.AR.1.2', 'MA.4.AR.1.1', 'MA.5.AR.1.1', 'MA.6.AR.1.3']),
  ].map((k, order) => ({ ...k, order }));

  const S = (id, parentId, firstName, lastName, grade, school, goals, adminNotes, avatarColor, days, hasBook = true) => ({
    id, parentId, firstName, lastName, grade, school, schoolYear: '2026–27', goals, adminNotes, avatarColor, status: 'ACTIVE',
    hasBookAt: hasBook && isFastGrade(grade) ? ago((days - 3) * DAY) : null, createdAt: ago(days * DAY), updatedAt: ago(5 * DAY),
  });
  const students = [
    S('s_ava', 'u_monique', 'Ava', 'Johnson', 2, 'Palm Grove Elementary', 'Two-digit addition with regrouping and telling time.', 'Loves animal word problems. Fades after about 45 minutes, so build in a movement break.', 'brand', 90),
    S('s_leo', 'u_monique', 'Leo', 'Johnson', 0, 'Palm Grove Elementary', 'Counting to 100 and comparing numbers by spring.', 'Short sessions only. Responds well to stickers.', 'reward', 60),
    S('s_sofia', 'u_daniel', 'Sofia', 'Reyes', 4, 'Coral Terrace Elementary', 'Feel confident with fractions before 5th grade.', 'Soccer Tue/Thu. Prefers 5 PM or later.', 'good', 75),
    S('s_arjun', 'u_priya', 'Arjun', 'Patel', 6, 'Westbay Middle', 'Ratios and integers for middle school.', 'Rushes multi-step problems. Ask him to explain each step.', 'brand', 60),
    S('s_maya', 'u_priya', 'Maya', 'Patel', 1, 'Bayside K–8 Center', 'Adding within 20 and counting by 5s and 10s.', null, 'reward', 60),
    S('s_jordan', 'u_keisha', 'Jordan', 'Brooks', 3, 'Sunrise Lakes Elementary', 'Multiplication facts and word problems.', 'New family, first month.', 'good', 6, false),
    S('s_mateo', 'u_ana', 'Mateo', 'Mendoza', 3, 'Coral Terrace Elementary', 'Build stamina for longer word problems.', 'Loves soccer stats. Use them in word problems.', 'brand', 50),
    S('s_lucia', 'u_ana', 'Lucia', 'Mendoza', 5, 'Coral Terrace Elementary', 'Decimals and fractions before middle school.', null, 'reward', 50),
    S('s_noah', 'u_grace', 'Noah', 'Kim', 5, 'Kendale Park Elementary', 'Confidence with fractions and multi-step problems.', 'Gets anxious with timed work. Avoid the timer. Prefers video sessions from home.', 'good', 44),
    S('s_zoe', 'u_marcus', 'Zoe', 'Thompson', 1, 'Bayside K–8 Center', 'Adding and subtracting within 20.', 'Twin brother Eli is also a student.', 'brand', 40),
    S('s_eli', 'u_marcus', 'Eli', 'Thompson', 4, 'Bayside K–8 Center', 'Multiplication facts and area.', null, 'reward', 40),
    S('s_amir', 'u_fatima', 'Amir', 'Ali', 2, 'Palm Grove Elementary', 'Adding with regrouping and money.', null, 'good', 33),
    S('s_olivia', 'u_hannah', 'Olivia', 'Wells', 0, 'Sunrise Lakes Elementary', 'Counting objects and writing numbers to 20.', 'Bring the counting bears.', 'brand', 30),
    S('s_chidi', 'u_david', 'Chidi', 'Okafor', 6, 'Westbay Middle', 'Ratios and challenge problems.', 'Very strong. Push with challenge problems. Saturday video works best.', 'reward', 46),
  ];
  const studentSubjects = students.map((s) => ({ studentId: s.id, subjectId: 'sub_math' }));

  const locations = [
    { id: 'loc_studio', name: 'Vienne’s Studio', kind: 'TUTOR', address: '2140 Coral Way, Suite 3', active: true },
    { id: 'loc_home', name: 'Student’s Home', kind: 'HOME', address: null, active: true },
    { id: 'loc_library', name: 'Coral Pines Library', kind: 'LIBRARY', address: '410 SW 57th Ave', active: true },
  ];

  /* Weekly hours. `modes` says what each block offers. */
  const availability = [
    ...[1, 2, 3, 4].map((weekday) => ({ id: `av_${weekday}`, weekday, startMin: 15 * 60, endMin: 19 * 60, modes: ['IN_PERSON', 'VIDEO'] })),
    { id: 'av_6', weekday: 6, startMin: 9 * 60, endMin: 13 * 60, modes: ['IN_PERSON', 'VIDEO'] },
  ];
  const timeOff = [{ id: 'to_1', startsAt: at(18, 0), endsAt: at(24, 23, 59), reason: 'Family trip' }];

  const settings = {
    id: 1, timezone: 'America/New_York', sessionLengths: [30, 45, 60], slotStepMin: 15, minNoticeHours: 24, cancelCutoffHours: 24, horizonWeeks: 4,
    defaultMeetingUrl: MEETING_URL, joinOpensMin: 15,
    fastWindows: [
      // Miami-Dade 2026–27 testing calendar (School Board, Aug 11 2026; tentative, may change).
      // Grades 3–6 FAST Math. K–2 Star Math has the same PM1/PM2 windows; its PM3 opens earlier, Apr 12.
      { window: 'PM1', schoolYear: '2026–27', startsAt: '2026-08-13T04:00:00.000Z', endsAt: '2026-09-26T03:59:00.000Z' }, // Aug 13 – Sep 25
      { window: 'PM2', schoolYear: '2026–27', startsAt: '2026-11-30T05:00:00.000Z', endsAt: '2027-01-23T04:59:00.000Z' }, // Nov 30 – Jan 22
      { window: 'PM3', schoolYear: '2026–27', startsAt: '2027-05-03T04:00:00.000Z', endsAt: '2027-05-29T03:59:00.000Z' }, // May 3 – 28
    ],
  };

  /* ── Sessions ───────────────────────────────────────────── */
  const sessions = [];
  const sessionNotes = [];
  const sessionNoteSkills = [];
  const studentOf = (id) => students.find((s) => s.id === id);
  const skillsFor = (grade) => skills.filter((k) => grade >= k.gradeMin && grade <= k.gradeMax);
  const offTime = (iso) => timeOff.some((o) => new Date(iso) >= new Date(o.startsAt) && new Date(iso) <= new Date(o.endsAt));
  let n = 0;
  const addSession = (studentId, start, durationMin, where, status, extra = {}) => {
    const video = where === 'VIDEO';
    const [locationId, address] = video ? [null, null] : Array.isArray(where) ? where : [where, null];
    const row = {
      id: extra.id || `ses_${(n += 1)}`, studentId, subjectId: 'sub_math', mode: video ? 'VIDEO' : 'IN_PERSON', locationId, address, meetingUrl: video ? MEETING_URL : null,
      requestedById: studentOf(studentId).parentId, startsAt: start, endsAt: plus(start, durationMin), durationMin, status,
      parentNote: null, declineReason: null, confirmedAt: status === 'REQUESTED' ? null : plus(start, -7 * 24 * 60),
      cancelledById: null, cancelledAt: null, cancelReason: null, callStartedAt: null, callEndedAt: null,
      reminderSentAt: null, createdAt: plus(start, -9 * 24 * 60), updatedAt: plus(start, 60), ...extra,
    };
    if (status === 'CANCELLED') Object.assign(row, { cancelledById: row.requestedById, cancelledAt: plus(start, -26 * 60), cancelReason: row.cancelReason || pick(['Sick day.', 'Family visiting this week.', 'School concert.']) });
    if (video && status === 'COMPLETED') Object.assign(row, { callStartedAt: plus(start, 1), callEndedAt: plus(start, durationMin - 2) });
    sessions.push(row);
    return row;
  };

  const NOTES = [
    '{n} worked through {skill} by drawing a model first. Much less guessing today.',
    'We practised {skill} with hands-on pieces, then moved to paper. {n} explained the steps out loud.',
    'Warm-up on facts, then {skill}. {n} caught two of their own mistakes, which is a great sign.',
    '{n} found the pattern quickly. Next time we stretch {skill} to harder numbers.',
    'Went over the book questions {n} missed, then more {skill}. Steady progress.',
  ];
  const HOMEWORK = ['Finish the book questions we started.', '10 minutes of facts practice each day.', null, null];
  const addNote = (session, { summary, skillIds, shared = true } = {}) => {
    const student = studentOf(session.studentId);
    const skill = pick(skillsFor(student.grade));
    const id = `note_${session.id}`;
    sessionNotes.push({
      id, sessionId: session.id, attendance: rand() < 0.1 ? 'LATE' : 'PRESENT',
      summary: summary || pick(NOTES).replaceAll('{n}', student.firstName).replace('{skill}', skill.name.toLowerCase()),
      homework: pick(HOMEWORK), sharedWithParent: shared && rand() > 0.1, source: 'TYPED', createdAt: plus(session.endsAt, 20), updatedAt: plus(session.endsAt, 20),
    });
    (skillIds || [skill.id]).forEach((skillId) => sessionNoteSkills.push({ sessionNoteId: id, skillId }));
  };

  /* Today */
  addSession('s_sofia', at(0, 10), 45, 'loc_studio', 'CONFIRMED', { id: 'ses_t1' });
  addSession('s_ava', at(0, 15, 30), 60, ['loc_home', '18 Banyan Ln'], 'CONFIRMED', { id: 'ses_t2', reminderSentAt: ago(20 * H) });
  addSession('s_arjun', at(0, 17, 15), 45, 'loc_library', 'CONFIRMED', { id: 'ses_t3' });

  /* A video call about to start, so the demo shows the Join call button. */
  const soon = new Date(Math.ceil((Date.now() + 8 * 60000) / 300000) * 300000).toISOString();
  addSession('s_noah', soon, 45, 'VIDEO', 'CONFIRMED', { id: 'ses_live' });

  /* Weekly slots: [student, weekday, hour, minute, minutes, where] */
  const slots = [
    ['s_mateo', 1, 18, 30, 45, 'loc_studio'],
    ['s_noah', 2, 15, 0, 45, 'VIDEO'],
    ['s_zoe', 2, 18, 15, 30, 'loc_studio'],
    ['s_eli', 3, 17, 0, 45, 'loc_studio'],
    ['s_amir', 3, 18, 15, 45, ['loc_home', '5 Royal Palm Pl']],
    ['s_olivia', 4, 15, 0, 30, 'loc_studio'],
    ['s_lucia', 4, 18, 0, 60, ['loc_home', '912 Ponce Cir']],
    ['s_chidi', 6, 11, 30, 60, 'VIDEO'],
    ['s_ava', 3, 15, 30, 60, ['loc_home', '18 Banyan Ln']],
    ['s_leo', 4, 16, 15, 30, 'loc_studio'],
    ['s_sofia', 2, 17, 0, 45, 'loc_studio'],
    ['s_maya', 6, 10, 0, 45, 'loc_studio'],
    ['s_arjun', 1, 16, 0, 45, 'loc_library'],
  ];
  slots.forEach(([sid, weekday, hh, mm, minutes, where]) => {
    for (let w = -6; w <= 2; w += 1) {
      const start = dateAt(dayInWeek(w, weekday), hh, mm);
      if (offTime(start) || Math.abs(new Date(start) - Date.now()) < 12 * H) continue;
      if (new Date(start) > new Date()) {
        addSession(sid, start, minutes, where, 'CONFIRMED');
        continue;
      }
      const roll = rand();
      const status = roll < 0.06 ? 'CANCELLED' : roll < 0.09 ? 'NO_SHOW' : 'COMPLETED';
      const s = addSession(sid, start, minutes, where, status);
      if (status === 'COMPLETED') addNote(s);
    }
  });
  /* Jordan is new: one first session last week, one booked */
  const j1 = addSession('s_jordan', dateAt(dayInWeek(-1, 4), 17), 45, 'loc_library', 'COMPLETED', { id: 'ses_p5' });
  addNote(j1, { summary: 'First session! Jordan knows his 2s, 5s and 10s. We started the book’s Mini-test 1 together; the rest is homework.', skillIds: ['sk_mult_div'] });
  addSession('s_jordan', at(1, 17), 45, 'loc_library', 'CONFIRMED', { id: 'ses_u1' });

  /* Requests (fit the rules, wait for Vienne) */
  const req = (id, sid, start, minutes, where, note, hoursAgo) => addSession(sid, start, minutes, where, 'REQUESTED', { id, parentNote: note, createdAt: ago(hoursAgo * H) });
  req('ses_r1', 's_jordan', dateAt(dayInWeek(1, 5), 15), 45, 'VIDEO', 'Could we try a video session this week? Jordan has a cold.', 1);
  req('ses_r2', 's_lucia', dateAt(dayInWeek(1, 6), 9), 45, 'loc_studio', 'Lucia wants extra practice on decimals before the next FAST test.', 3);
  req('ses_r3', 's_maya', dateAt(dayInWeek(2, 1), 16), 30, ['loc_home', '77 Mango Ct'], null, 5);
  req('ses_r4', 's_chidi', dateAt(dayInWeek(2, 2), 15, 45), 45, 'loc_library', 'Math competition practice, if you have time.', 30);
  /* A cancellation by a parent */
  addSession('s_arjun', dateAt(dayInWeek(1, 3), 15), 45, 'loc_studio', 'CANCELLED', { id: 'ses_c1', cancelReason: 'School event ran late.', cancelledAt: ago(DAY) });

  /* ── The book: one per grade, 2 mini-tests and 4 full tests ── */
  const TESTS = [
    { key: 'M1', name: 'Mini-test 1', count: 12 },
    { key: 'M2', name: 'Mini-test 2', count: 12 },
    { key: 'T1', name: 'Test 1', count: 40 },
    { key: 'T2', name: 'Test 2', count: 40 },
    { key: 'T3', name: 'Test 3', count: 40 },
    { key: 'T4', name: 'Test 4', count: 40 },
  ];
  const books = [3, 4, 5, 6].map((grade) => ({ id: `book_g${grade}`, title: BOOK_TITLE, grade, tests: TESTS, buyUrl: 'https://www.amazon.com/s?k=florida+test+prep+fast+mathematics+grade+' + grade, createdAt: ago(100 * DAY) }));
  /* Which tests already have Vienne's answer key entered */
  const keyed = { 3: ['M1', 'M2', 'T1', 'T2'], 4: ['M1', 'M2', 'T1'], 5: ['M1', 'M2', 'T1', 'T2', 'T3'], 6: ['M1', 'M2', 'T1'] };
  const FRACTIONS = ['3/4', '2/5', '5/8', '1/3', '7/10', '3/2'];
  const answerFor = (format) => {
    if (format === 'MC') return pick(['A', 'B', 'C', 'D']);
    if (format === 'MULTI') return pick(['A,C', 'B,D', 'A,B,E', 'C,E']);
    if (format === 'NUMERIC') return rand() < 0.4 ? pick(FRACTIONS) : String(Math.floor(rand() * 90) + 6);
    return null;
  };
  const bookItems = [];
  // The book's questions use their own fixed sequence: everything above depends on today's
  // date (how many sessions fit), and a printed book's answer key shouldn't change day to day.
  const resumeAt = r;
  r = 4242;
  books.forEach((book) => {
    const codes = codesForGrade(book.grade);
    keyed[book.grade].forEach((test) => {
      const { count } = TESTS.find((t) => t.key === test);
      for (let number = 1; number <= count; number += 1) {
        const roll = rand();
        const format = test.startsWith('T') && number % 13 === 0 ? 'OPEN' : roll < 0.72 ? 'MC' : roll < 0.84 ? 'MULTI' : 'NUMERIC';
        bookItems.push({
          id: `bi_g${book.grade}_${test}_${number}`, bookId: book.id, test, number, format,
          choiceCount: format === 'MULTI' ? 5 : format === 'MC' ? 4 : null, answer: answerFor(format),
          benchmarkCode: codes[(number * 7 + test.length) % codes.length], points: format === 'OPEN' ? 2 : 1, source: 'TYPED',
        });
      }
    });
  });
  r = resumeAt;
  const itemsOf = (bookId, test, from = 1, to = 999) => bookItems.filter((b) => b.bookId === bookId && b.test === test && b.number >= from && b.number <= to);

  /* ── Content: math resources and official FLDOE practice links ── */
  const fileAssets = [
    ['fa_fraction_strips', 'fraction-strips-worksheet.pdf', 'application/pdf', 482113],
    ['fa_regrouping', 'regrouping-practice.pdf', 'application/pdf', 318422],
    ['fa_hundred', 'hundred-chart.png', 'image/png', 188230],
    ['fa_mult', 'multiplication-facts-6-9.pdf', 'application/pdf', 201877],
    ['fa_decimals', 'decimal-place-value-mat.pdf', 'application/pdf', 220133],
    ['fa_area', 'area-and-perimeter-practice.pdf', 'application/pdf', 266410],
    ['fa_arjun_work', 'arjun-test1-q13.jpg', 'image/jpeg', 2311045],
    ['fa_lucia_work', 'lucia-test1-q13.jpg', 'image/jpeg', 1984410],
  ].map(([id, filename, mimeType, sizeBytes]) => ({ id, storageKey: `uploads/${id}`, filename, mimeType, sizeBytes, uploadedById: id.endsWith('_work') ? 'u_priya' : 'u_admin', createdAt: ago(20 * DAY) }));
  const tags = [{ id: 'tag_practice', name: 'practice' }, { id: 'tag_visual', name: 'visual' }, { id: 'tag_home', name: 'at-home' }, { id: 'tag_fast', name: 'FAST' }];
  const R = (id, title, description, kind, gradeMin, gradeMax, extra = {}) => ({
    id, title, description, kind, subjectId: 'sub_math', gradeMin, gradeMax, fileId: null, thumbnailId: null, url: null, body: null,
    visibility: 'ALL', status: 'PUBLISHED', showInPreview: false, createdAt: ago(30 * DAY), updatedAt: ago(Math.floor(rand() * 20) * DAY), ...extra,
  });
  const resources = [
    R('res_fldoe_samples', 'FAST sample questions (official)', 'Free practice questions from the Florida Department of Education, on the same screen the real test uses.', 'LINK', 3, 6, { url: 'https://flfast.org/families.html', showInPreview: true }),
    R('res_fldoe_calc', 'FAST calculator practice', 'Try the on-screen calculator used on the real test.', 'LINK', 6, 6, { url: 'https://flfast.org/resource-item/en/4-function-calculator' }),
    R('res_fraction_strips', 'Fraction strips worksheet', 'Cut-out strips for comparing and finding equivalent fractions.', 'WORKSHEET', 3, 5, { fileId: 'fa_fraction_strips', showInPreview: true }),
    R('res_regrouping', 'Regrouping practice', 'Two-digit addition and subtraction with regrouping, 20 problems.', 'WORKSHEET', 1, 3, { fileId: 'fa_regrouping' }),
    R('res_place_value_video', 'Place value song', 'A catchy 4-minute video on ones, tens and hundreds.', 'VIDEO', 1, 3, { url: 'https://www.youtube.com/watch?v=example', showInPreview: true }),
    R('res_hundred_chart', 'Hundred chart', 'Printable 1–100 chart for counting and skip-counting.', 'IMAGE', 0, 2, { fileId: 'fa_hundred' }),
    R('res_mult', 'Multiplication facts 6–9', 'Practice sheet for the trickier facts. No timer needed.', 'WORKSHEET', 3, 5, { fileId: 'fa_mult', visibility: 'SELECTED' }),
    R('res_decimals', 'Decimal place value mat', 'Tenths and hundredths on one page.', 'WORKSHEET', 4, 6, { fileId: 'fa_decimals' }),
    R('res_area', 'Area and perimeter practice', 'Rectangles, then shapes made of rectangles.', 'WORKSHEET', 3, 5, { fileId: 'fa_area' }),
    R('res_fraction_video', 'Comparing fractions (video)', 'Six minutes on common denominators.', 'VIDEO', 3, 5, { url: 'https://www.youtube.com/watch?v=example2' }),
    R('res_test_day', 'Getting ready for test day', 'How to help at home the week of a FAST test.', 'NOTE', 3, 6, { body: { type: 'doc', text: 'Keep the week calm. A good night’s sleep and breakfast matter more than extra practice. On the test, read each question twice, use scratch paper, and skip a hard question and come back to it.' }, showInPreview: true }),
    R('res_counting', 'Counting games at home', 'Five quick games with things you already have.', 'NOTE', 0, 1, { body: { type: 'doc', text: 'Count stairs as you climb. Count spoons as you set the table. Make groups of 10 with coins. Ask “how many more to make 10?” Play “I’m thinking of a number between 1 and 20.”' } }),
    R('res_ratio_intro', 'Ratios with recipes', 'Scaling a pancake recipe to explain ratios.', 'NOTE', 6, 6, { status: 'DRAFT', body: { type: 'doc', text: 'If 2 cups of flour make 8 pancakes, how much flour for 20?' } }),
  ];
  const resourceTags = [['res_fraction_strips', 'tag_visual'], ['res_regrouping', 'tag_practice'], ['res_mult', 'tag_practice'], ['res_fldoe_samples', 'tag_fast'], ['res_test_day', 'tag_fast']].map(([resourceId, tagId]) => ({ resourceId, tagId }));
  const resourceShares = [{ resourceId: 'res_mult', studentId: 's_sofia' }, { resourceId: 'res_mult', studentId: 's_jordan' }, { resourceId: 'res_mult', studentId: 's_eli' }];

  /* ── Book assignments and answer sheets ─────────────────── */
  const assignments = [];
  const submissions = [];
  const redoItems = [];
  const A = (id, grade, test, from, to, dueDays, extra = {}) => {
    const book = books.find((b) => b.grade === grade);
    const t = TESTS.find((x) => x.key === test);
    const count = itemsOf(book.id, test).length;
    const range = from === 1 && to >= count ? '' : `, #${from}–${to}`;
    const row = {
      id, title: `${t.name}${range}`, instructions: extra.instructions ?? 'Do these in your book, then fill in your answers here.', kind: 'BOOK', subjectId: 'sub_math',
      resourceId: null, bookId: book.id, bookTest: test, bookFrom: from, bookTo: Math.min(to, count), dueAt: ago(-dueDays * DAY), createdAt: ago((Math.max(dueDays, 0) + 7) * DAY),
    };
    assignments.push(row);
    return row;
  };
  const Sub = (id, a, studentId, status, extra = {}) => {
    const row = { id, assignmentId: a.id, studentId, status, answers: null, photos: [], fileId: null, autoScore: null, score: null, maxScore: null, feedback: null, stars: 0, submittedById: null, submittedAt: null, gradedAt: null, ...extra };
    submissions.push(row);
    return row;
  };
  const wrongValue = (item) => (item.format === 'MC' ? ['A', 'B', 'C', 'D'].find((x) => x !== item.answer) : item.format === 'MULTI' ? 'A' : item.format === 'NUMERIC' ? '12' : null);
  /** A finished answer sheet: `misses` are the question numbers the child got wrong. */
  const answered = (id, a, studentId, misses, hoursAgo, { openCorrect = null, photo = null } = {}) => {
    const student = studentOf(studentId);
    const items = itemsOf(a.bookId, a.bookTest, a.bookFrom, a.bookTo);
    const answers = items.map((it) =>
      it.format === 'OPEN'
        ? { number: it.number, value: null, correct: openCorrect }
        : { number: it.number, value: misses.includes(it.number) ? wrongValue(it) : it.answer, correct: !misses.includes(it.number) },
    );
    const max = items.reduce((t, it) => t + it.points, 0);
    const auto = items.filter((it) => it.format !== 'OPEN' && !misses.includes(it.number)).reduce((t, it) => t + it.points, 0);
    const open = items.filter((it) => it.format === 'OPEN');
    const waiting = open.length > 0 && openCorrect === null;
    const score = auto + (openCorrect ? open.reduce((t, it) => t + it.points, 0) : 0);
    const when = ago(hoursAgo * H);
    const row = Sub(id, a, studentId, waiting ? 'SUBMITTED' : 'GRADED', {
      answers, photos: open.map((it) => ({ number: it.number, fileId: photo })), autoScore: auto, score: waiting ? null : score, maxScore: max,
      stars: waiting ? 0 : score / max >= 0.9 ? 3 : score / max >= 0.7 ? 2 : 1, submittedById: student.parentId, submittedAt: when, gradedAt: waiting ? null : when,
    });
    misses.forEach((number) => {
      const item = items.find((it) => it.number === number);
      if (item) redoItems.push({ id: `redo_${id}_${number}`, studentId, bookItemId: item.id, source: 'ANSWER_SHEET', submissionId: id, createdAt: when, clearedAt: null });
    });
    return row;
  };

  const g3m1 = A('as_g3_m1', 3, 'M1', 1, 12, -9);
  answered('sb_mateo_m1', g3m1, 's_mateo', [4, 9], 9 * 24);
  Sub('sb_jordan_m1', g3m1, 's_jordan', 'ASSIGNED');
  const g3t1 = A('as_g3_t1', 3, 'T1', 1, 20, 3);
  Sub('sb_mateo_t1', g3t1, 's_mateo', 'ASSIGNED');

  const g4m1 = A('as_g4_m1', 4, 'M1', 1, 12, -6);
  answered('sb_sofia_m1', g4m1, 's_sofia', [3, 7, 11], 6 * 24);
  answered('sb_eli_m1', g4m1, 's_eli', [2, 5, 7, 8, 10], 5 * 24);
  const g4m2 = A('as_g4_m2', 4, 'M2', 1, 12, 2);
  Sub('sb_sofia_m2', g4m2, 's_sofia', 'ASSIGNED');
  Sub('sb_eli_m2', g4m2, 's_eli', 'ASSIGNED');

  const g5m1 = A('as_g5_m1', 5, 'M1', 1, 12, -12);
  answered('sb_lucia_m1', g5m1, 's_lucia', [6], 12 * 24);
  answered('sb_noah_m1', g5m1, 's_noah', [2, 6, 10], 11 * 24);
  const g5t1 = A('as_g5_t1', 5, 'T1', 1, 20, -1);
  answered('sb_lucia_t1', g5t1, 's_lucia', [5, 14, 17], 5, { photo: 'fa_lucia_work' });
  answered('sb_noah_t1', g5t1, 's_noah', [3, 6, 11, 14, 18], 30, { openCorrect: true, photo: 'fa_lucia_work' });
  const g5t1b = A('as_g5_t1b', 5, 'T1', 21, 40, 4);
  Sub('sb_lucia_t1b', g5t1b, 's_lucia', 'ASSIGNED');
  Sub('sb_noah_t1b', g5t1b, 's_noah', 'ASSIGNED');

  const g6t1 = A('as_g6_t1', 6, 'T1', 1, 20, -2);
  answered('sb_arjun_t1', g6t1, 's_arjun', [4, 8, 15, 19], 3, { photo: 'fa_arjun_work' });
  answered('sb_chidi_t1', g6t1, 's_chidi', [19], 50, { openCorrect: true, photo: 'fa_arjun_work' });
  const g6m2 = A('as_g6_m2', 6, 'M2', 1, 12, 5);
  Sub('sb_arjun_m2', g6m2, 's_arjun', 'ASSIGNED');
  Sub('sb_chidi_m2', g6m2, 's_chidi', 'ASSIGNED');

  /* Practice (not from the book): official sample questions */
  const prac = { id: 'as_fldoe', title: 'Try the official FAST sample questions', instructions: 'Open the link, pick your grade and Mathematics, and try a few. Tap Done when you’re finished.', kind: 'PRACTICE', subjectId: 'sub_math', resourceId: 'res_fldoe_samples', bookId: null, bookTest: null, bookFrom: null, bookTo: null, dueAt: ago(-6 * DAY), createdAt: ago(DAY) };
  assignments.push(prac);
  ['s_lucia', 's_noah', 's_sofia'].forEach((sid) => Sub(`sb_${sid.slice(2)}_fldoe`, prac, sid, 'ASSIGNED'));
  /* Redo items Vienne added from a session */
  redoItems.push({ id: 'redo_sess_ava', studentId: 's_sofia', bookItemId: 'bi_g4_M1_5', source: 'SESSION', submissionId: null, createdAt: ago(6 * DAY), clearedAt: null });

  /* ── FAST and Star Math results ─────────────────────────── */
  const fastResults = [];
  const F = (studentId, window, schoolYear, scaleScore, level, categoryLevels, enteredById, daysAgo, extra = {}) => {
    const student = studentOf(studentId);
    fastResults.push({
      id: `fr_${studentId.slice(2)}_${window}_${schoolYear.slice(0, 4)}`, studentId, schoolYear, window, testType: isFastGrade(student.grade) ? 'FAST_MATH' : 'STAR_MATH',
      gradeTested: extra.gradeTested ?? student.grade, scaleScore, level, percentile: extra.percentile ?? null, categories: categoryLevels, enteredById, enteredAt: ago(daysAgo * DAY),
    });
  };
  const lv = (grade, levels) => {
    const ids = { 3: ['add', 'mult', 'frac', 'geo'], 4: ['whole', 'frac', 'geo'], 5: ['whole', 'frac', 'alg', 'geo'], 6: ['nso', 'alg', 'geo'] }[grade];
    return ids.map((id, i) => ({ categoryId: `rc_${grade}_${id}`, level: levels[i] }));
  };
  F('s_sofia', 'PM1', '2026–27', 222, 2, lv(4, [3, 2, 3]), 'u_daniel', 70);
  F('s_sofia', 'PM3', '2025–26', 214, 3, [], 'u_admin', 160, { gradeTested: 3 });
  F('s_arjun', 'PM1', '2026–27', 241, 3, lv(6, [3, 2, 4]), 'u_priya', 68);
  F('s_mateo', 'PM1', '2026–27', 204, 2, lv(3, [3, 2, 2, 3]), 'u_admin', 66);
  F('s_lucia', 'PM1', '2026–27', 232, 3, lv(5, [4, 2, 3, 3]), 'u_ana', 71);
  F('s_lucia', 'PM3', '2025–26', 226, 3, [], 'u_ana', 165, { gradeTested: 4 });
  F('s_noah', 'PM1', '2026–27', 219, 2, lv(5, [3, 1, 2, 3]), 'u_admin', 69);
  F('s_eli', 'PM1', '2026–27', 210, 1, lv(4, [2, 1, 2]), 'u_marcus', 64);
  F('s_chidi', 'PM1', '2026–27', 262, 5, lv(6, [5, 4, 5]), 'u_david', 70);
  F('s_ava', 'PM1', '2026–27', 512, null, [], 'u_monique', 72, { percentile: 58 });
  F('s_amir', 'PM1', '2026–27', 431, null, [], 'u_admin', 67, { percentile: 34 });
  F('s_zoe', 'PM1', '2026–27', 288, null, [], 'u_marcus', 64, { percentile: 61 });
  F('s_maya', 'PM1', '2026–27', 301, null, [], 'u_priya', 66, { percentile: 66 });

  /* ── Progress reports (rated by skill; grouped by FAST area on screen) ── */
  const progressReports = [];
  const reportRatings = [];
  const rep = (id, sid, daysAgo, summary, ratings, status = 'PUBLISHED') => {
    progressReports.push({ id, studentId: sid, periodStart: ago((daysAgo + 30) * DAY), periodEnd: ago(daysAgo * DAY), summary, status, publishedAt: status === 'PUBLISHED' ? ago((daysAgo - 1) * DAY) : null, createdAt: ago(daysAgo * DAY) });
    ratings.forEach(([skillId, rating, comment], i) => reportRatings.push({ id: `rr_${id}_${i}`, reportId: id, skillId, rating, comment: comment ?? null }));
  };
  rep('rep_ava_1', 's_ava', 15, 'Ava has grown so much this month! She now regroups confidently with blocks and is starting to do it on paper. Telling time to the half hour is next.', [['sk_place_value', 3, 'Solid with tens and ones.'], ['sk_add_sub', 2, 'Regrouping is coming along.'], ['sk_measurement', 2]]);
  rep('rep_sofia_1', 's_sofia', 10, 'Sofia understands what fractions represent and finds equivalent fractions with models. Next: comparing fractions with different denominators, which showed up in her PM1 results too.', [['sk_fractions', 2, 'Comparing is next.'], ['sk_mult_div', 3], ['sk_geometry', 3]]);
  rep('rep_mateo_1', 's_mateo', 8, 'Mateo is much more patient with word problems and now draws a picture before solving. Multiplication facts are getting quicker.', [['sk_word_problems', 3, 'Draws a model first.'], ['sk_mult_div', 2], ['sk_fractions', 2]]);
  rep('rep_noah_1', 's_noah', 12, 'Noah has made real progress with fractions. Timed work still makes him anxious, so we practise without the clock. Video sessions from home are working well.', [['sk_fractions', 3], ['sk_word_problems', 2, 'Multi-step problems are next.'], ['sk_decimals', 2]]);
  rep('rep_chidi_1', 's_chidi', 6, 'Chidi is ready for harder ratio problems and scored Level 5 on PM1. We are using the book’s full tests to build stamina.', [['sk_ratios', 4, 'Ready for challenge problems.'], ['sk_integers', 3], ['sk_data', 3]]);
  rep('rep_arjun_1', 's_arjun', 0, 'Arjun understands ratios and is getting faster with integers.', [['sk_ratios', 3], ['sk_integers', 2]], 'DRAFT');
  rep('rep_eli_1', 's_eli', 0, 'Eli knows his 2s, 5s and 10s facts well.', [['sk_mult_div', 2]], 'DRAFT');

  /* ── Messages ───────────────────────────────────────────── */
  const conversations = users.filter((u) => u.role === 'PARENT' && u.status === 'ACTIVE').map((u) => ({ id: `conv_${u.id.slice(2)}`, parentId: u.id, lastMessageAt: u.createdAt, adminLastReadAt: ago(DAY), parentLastReadAt: ago(DAY) }));
  const messages = [];
  const M = (conv, sender, body, hoursAgo) => {
    messages.push({ id: `m${messages.length + 1}`, conversationId: conv, senderId: sender, body, createdAt: ago(hoursAgo * H) });
    const c = conversations.find((x) => x.id === conv);
    if (new Date(ago(hoursAgo * H)) > new Date(c.lastMessageAt)) c.lastMessageAt = ago(hoursAgo * H);
  };
  M('conv_monique', 'u_monique', 'Hi Vienne! Ava has a math quiz on Friday about telling time. Could we spend a few minutes on it?', 74);
  M('conv_monique', 'u_admin', 'Absolutely! I’ll bring the practice clock and we’ll warm up with it.', 72);
  M('conv_monique', 'u_admin', 'Quick note from today: Ava did really well with regrouping. 15 minutes of practice is plenty this week.', 20);
  M('conv_daniel', 'u_daniel', 'Sofia’s soccer practice moved to Wednesdays. Could we switch to 5:30 that day?', 2);
  M('conv_priya', 'u_priya', 'Arjun will be about 10 minutes late on Thursday, sorry!', 25);
  M('conv_priya', 'u_admin', 'No problem at all, thanks for the heads up.', 24);
  M('conv_keisha', 'u_keisha', 'Thanks so much for the invite! Jordan is excited to get started. We ordered the book.', 121);
  M('conv_keisha', 'u_admin', 'Welcome, Keisha! Request a time whenever you’re ready and I’ll confirm it.', 120);
  M('conv_ana', 'u_ana', 'Hi Vienne, could Lucia get an extra session before her next FAST test?', 4);
  M('conv_grace', 'u_admin', 'Noah did really well on video today. I skipped the timer and he relaxed right away.', 50);
  M('conv_grace', 'u_grace', 'That’s wonderful, thank you for noticing that!', 47);
  M('conv_marcus', 'u_marcus', 'Eli finished his mini-test and says the book is easier now!', 9);
  M('conv_marcus', 'u_admin', 'That’s great to hear. Tell him I’m proud of him.', 8);
  M('conv_fatima', 'u_fatima', 'Amir has a dentist appointment Wednesday. Is 6:30 okay instead?', 6);
  M('conv_david', 'u_admin', 'Chidi’s Test 1 was nearly perfect. Only #19 to look at together on Saturday.', 27);
  M('conv_hannah', 'u_hannah', 'Olivia keeps asking when she gets to see you again!', 70);
  ['conv_monique', 'conv_priya', 'conv_keisha', 'conv_grace', 'conv_david', 'conv_hannah'].forEach((id) => (conversations.find((c) => c.id === id).adminLastReadAt = ago(H)));
  conversations.find((c) => c.id === 'conv_daniel').adminLastReadAt = ago(2 * DAY);
  ['conv_ana', 'conv_fatima', 'conv_marcus'].forEach((id) => (conversations.find((c) => c.id === id).adminLastReadAt = ago(12 * H)));
  conversations.find((c) => c.id === 'conv_monique').parentLastReadAt = ago(3 * DAY);

  /* ── Notifications ──────────────────────────────────────── */
  const notifications = [];
  // `link`: the child (studentId) and family (parentId) the alert is about, as the app stores them (S23b).
  const N = (userId, type, title, body, href, hoursAgo, read = false, link = {}) =>
    notifications.push({ id: `n${notifications.length + 1}`, userId, audience: userId === 'u_admin' ? 'ADMIN' : 'PARENT', type, title, body, href, channel: 'IN_APP', readAt: read ? ago((hoursAgo - 1) * H) : null, sentAt: ago(hoursAgo * H), createdAt: ago(hoursAgo * H), studentId: link.studentId ?? null, parentId: link.parentId ?? null });
  N('u_admin', 'SESSION_REQUESTED', 'New request from Keisha Brooks', 'Jordan, video call, 45 min', '/admin/schedule', 1, false, { studentId: 's_jordan', parentId: 'u_keisha' });
  N('u_admin', 'MESSAGE_RECEIVED', 'Daniel Reyes sent a message', 'Sofia’s soccer practice moved to Wednesdays…', '/admin/messages', 2, false, { parentId: 'u_daniel' });
  N('u_admin', 'SESSION_REQUESTED', 'New request from Ana Mendoza', 'Lucia, 45 min, Studio', '/admin/schedule', 3, false, { studentId: 's_lucia', parentId: 'u_ana' });
  N('u_admin', 'SUBMISSION_RECEIVED', 'Arjun finished Test 1, #1–20', '16 of 20 right. 1 written answer to check.', '/admin/assignments', 3, false, { studentId: 's_arjun', parentId: 'u_priya' });
  N('u_admin', 'SUBMISSION_RECEIVED', 'Lucia finished Test 1, #1–20', '17 of 20 right. 1 written answer to check.', '/admin/assignments', 5, false, { studentId: 's_lucia', parentId: 'u_ana' });
  N('u_admin', 'MESSAGE_RECEIVED', 'Fatima Ali sent a message', 'Amir has a dentist appointment Wednesday…', '/admin/messages', 6, false, { parentId: 'u_fatima' });
  N('u_admin', 'SESSION_CANCELLED_BY_PARENT', 'Priya Patel cancelled a session', 'Arjun, School event ran late.', '/admin/schedule', 24, true, { studentId: 's_arjun', parentId: 'u_priya' });
  N('u_admin', 'INVITE_REDEEMED', 'Keisha Brooks joined', 'Invite code used. Jordan added.', '/admin/families', 6 * 24, true, { parentId: 'u_keisha' });
  N('u_monique', 'SESSION_REMINDER', 'Reminder: Ava’s session today', '3:30 PM at your home', '/parent/sessions', 20, false, { studentId: 's_ava' });
  N('u_monique', 'SESSION_CONFIRMED', 'Vienne confirmed Ava’s session', '60 min at your home', '/parent/sessions', 20, false, { studentId: 's_ava' });
  N('u_monique', 'REPORT_PUBLISHED', 'New progress report for Ava', 'Vienne shared Ava’s latest progress.', '/parent/progress', 14 * 24, true, { studentId: 's_ava' });
  N('u_grace', 'SESSION_CONFIRMED', 'Vienne confirmed Noah’s video session', 'The Join call button appears 15 minutes before.', '/parent/sessions', 30, false, { studentId: 's_noah' });

  /* ── Invites ────────────────────────────────────────────── */
  // A redeemed code's planned entry keeps the id of the child it became, as redeemInvite stores it (S23b).
  const I = (id, code, parentName, parentEmail, planned, expiresDays, extra = {}) => ({
    id, codeHash: hashCode(code), codeHint: `MM-••${code.slice(-2)}`, parentName, parentEmail, plannedStudents: planned.map(([firstName, lastName, grade, studentId]) => ({ firstName, lastName, grade, subjectIds: ['sub_math'], ...(studentId && { studentId }) })),
    expiresAt: ago(-expiresDays * DAY), usedAt: null, usedById: null, revokedAt: null, createdAt: ago(4 * DAY), ...extra,
  });
  const invites = [
    I('inv_carmen', 'MM-4D8F', 'Carmen Diaz', 'carmen.diaz@example.com', [['Lucas', 'Diaz', 3]], 10),
    I('inv_greg', 'MM-7K4Q', 'Greg Wilson', null, [['Emma', 'Wilson', 1]], 3, { createdAt: ago(11 * DAY) }),
    I('inv_keisha', 'MM-2B9X', 'Keisha Brooks', 'keisha.brooks@example.com', [['Jordan', 'Brooks', 3, 's_jordan']], 4, { usedAt: ago(6 * DAY), usedById: 'u_keisha', createdAt: ago(10 * DAY) }),
    I('inv_rachel', 'MM-6P3T', 'Rachel Kim', null, [['Noa', 'Kim', 5]], -2, { createdAt: ago(16 * DAY) }),
    I('inv_sam', 'MM-9RT2', 'Sam Rivera', 'sam.rivera@example.com', [['Mia', 'Rivera', 2]], 12, { createdAt: ago(2 * DAY) }),
  ];

  return {
    users, students, studentSubjects, subjects, skills, locations, availability, timeOff, settings, sessions, sessionNotes, sessionNoteSkills,
    fileAssets, tags, resources, resourceTags, resourceShares, books, bookItems, assignments, submissions, redoItems, fastResults,
    progressReports, reportRatings, conversations, messages, notifications, invites, aiDrafts: [],
    /* Book-only: no authored question bank. Kept empty so old imports don't break during the port. */
    questions: [], assignmentQuestions: [],
  };
}

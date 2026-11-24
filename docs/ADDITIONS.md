# Planned additions: math only, Miami-Dade, FAST prep, optional video

Status: **built in the prototype** (math only, Miami-Dade, the book and answer sheet, FAST and Star Math results, optional video, the two AI features, bigger text and Undo). See BUILD_PLAN.md for the production build and CONTRACT.md for the API.

---

## 1. Math only

Vienne only teaches math. The data model keeps `Subject` so it doesn't box her in later, but the product behaves as math-only:

- Seed one subject: Math. Reading, Writing and Phonics content, notes and reports come out of the demo data.
- **Any picker with only one subject is hidden**: subject filters on Content, the subject step in booking, subject tags on session rows. That's a single rule (`subjects.length > 1`), not a fork of each screen.
- The space this frees goes to the next level down: **strand and benchmark** (see 3).
- The subject colour series is reused for the six B.E.S.T. math strands. Each strand gets one colour everywhere: the timeline, skill meters and report charts.

## 2. Miami-Dade context

| Change | Detail |
|---|---|
| Time zone | All scheduling in `America/New_York`. The prototype currently uses the browser's zone. |
| Student profile | Adds a **school** (an M-DCPS school name, free text) and a **school year**. No district student ID: we don't need it and it's sensitive. |
| FAST results | Parent or Vienne records each PM1/PM2/PM3 result: scale score, achievement level 1–5, and reporting-category levels when they have them (parents see these in the state Family Portal). |
| K–2 | In K–2 the FAST progress monitoring runs on Renaissance Star Math, which uses a different scale, so a result stores its **test type** (`FAST_MATH` or `STAR_MATH`). |
| Testing windows | Vienne enters the three PM windows from the M-DCPS calendar in Settings. Today shows "PM2 starts in 3 weeks" and which students are in grades 3–6. |
| Demo data | Miami-area places and 305/786 phone numbers instead of the current generic ones. |

## 3. FAST test prep

### Facts the design rests on
- FAST Mathematics is the statewide test for grades 3–8, aligned to the B.E.S.T. standards and given three times a year (PM1, PM2, PM3). In K–2 the progress monitoring uses Renaissance Star.
- Results come as an overall scale score and achievement level, plus scores by **reporting category**.
- FLDOE publishes a test design summary that lists, per grade, the reporting categories, which benchmarks fall in each and what share of the test each one is.
- FLDOE publishes free sample items and released tests for families at flfast.org.

### The book
Identified: **Florida Test Prep F.A.S.T. Practice Test Book, FAST Mathematics** (one book per grade; the copy shown is Grade 5: 2 mini-tests and 4 full tests). It's a print book. `bookRef` therefore stores the grade, test number and question number, for example "Gr 5, Test 2, #14".

Most "FAST test prep, all grades" workbooks come with an access code that unlocks the publisher's own online practice tests. That code is a licence for Vienne (or one student) to use **the publisher's site**. It doesn't let us copy the book's questions into our app, and scraping the online portal would break its terms even with a valid code. So we don't import the book. Instead we build around it:

1. **Book assignments.** A new assignment kind, `BOOK`, points at the book without copying it: book, grade, chapter, pages and problem numbers (for example "Ch 4, pp. 52–55, #1–14"). The parent marks it done and can attach a photo of the page. Vienne enters the score in the grade drawer. Each assignment is tagged with benchmarks, so the book work still feeds progress.
2. **Link-out to the publisher.** A resource of kind `LINK` that opens the publisher's online tests, with the note "Use the code inside your book." **The code is never stored in our database.**
3. **Official FLDOE practice.** Link resources per grade to the flfast.org sample items and released tests. We link out by default and only copy items in if FLDOE's terms clearly allow it.
4. **Vienne's own FAST-style questions.** Her question bank is where the app's own practice lives. Every question gets benchmark tags. New item types match what the test asks: **numeric entry**, **multi-select**, **matching/drag**, plus the existing multiple choice.
5. **Practice-test mode.** Generates a timed quiz from her bank, weighted by the FLDOE blueprint percentages for the student's grade. Results are shown by reporting category, so they read the same way as the state report.

### Book-first workflow (decided: her questions and assignments come from the book)
The book is the question bank. The app never stores the question text. It stores **where a question lives**, **what it tests** and **her answer key**:

- **Book map** (set up once per grade): `BookItem { book, grade, test, number, benchmarkCode, type, points }`. Vienne tags each question with its standard and format, or we tag a grade together with her as a starting point.
- **Answer key**: Vienne enters only the answers ("#14: B", "#22: 3/4", "#30: A, C"). Open-response questions are marked for her to grade.
- **Assign**: "Test 2, #1–20, due Fri" or "Mini-test 1". The student works in their own copy of the book.
- **Digital answer sheet**: on the parent's device the child sees numbered slots only (bubbles, a number pad, check boxes), not the questions. Submitting grades instantly against her key. For open-response questions they snap a photo of their work.
- **Results by standard**: every miss rolls up to its benchmark and FAST reporting category, so the student page and reports show "Fractions: 4 of 9" without her doing the maths.
- **Redo list**: the missed numbers ("Test 2: #6, #14, #19") show up in her next session prep and in the session drawer.
- **In-session mode**: she can mark questions right or wrong herself during a session when there's no answer sheet.

**Decided:** every student has their own copy (Vienne asks families to get it) and kids submit answers in the app. So book work is real homework, not just in-session work.

- **"Get the book" step for new families**: when a family joins, the parent sees the book for their child's grade, with a link to buy it, and taps "We have it". Vienne sees who still needs it on the family page. The prompt comes back when the child moves up a grade.
- **The answer key never reaches the device.** Grading happens on the server, the same way quizzes work now, so a child can't peek.
- **Kid-friendly answer sheet**: one question number per screen, big bubbles, a number pad with fraction and decimal keys, progress saved as they go, stars when they finish.

Templates and AI drafts from the earlier options become optional extras for extra practice on a weak standard. They're not the core.

### Taxonomy: subjects → B.E.S.T. benchmarks
```
Strand        NSO · FR · AR · M · GR · DP   (which strands apply depends on the grade)
Benchmark     MA.4.FR.1.2 (code, grade, strand, Vienne's own short label)
Reporting cat per grade, from the FLDOE test design summary (e.g. "Fractions")
Skill         stays. Vienne's teaching unit, mapped to 1+ benchmarks
```
Import the codes and reporting-category mapping once from FLDOE's published documents. The labels are Vienne's own short wording, not the full standard text.

### Where it shows up
- **Student page:** a FAST panel with the latest PM levels, a trend from PM1 to PM3 and the weakest reporting category. It links to the matching skills.
- **Progress report:** grouped by reporting category instead of subject, with "Book work this period: 6 of 7 done".
- **Parent Progress:** the same grouping, in plain language: "Fractions: getting stronger".
- **Content:** filters change from subject to grade → strand → benchmark.

## 4. Optional video sessions

Each session is either **in person** or **video call**. In person stays the default.

| Area | Plan |
|---|---|
| Data | `Session.mode: IN_PERSON \| VIDEO`. `locationId` is required only for in person. Adds `Session.meetingUrl`. |
| Availability | Each weekly block offers in person, video or both. Parents only see video where Vienne offers it. |
| Booking | Step 2 "Where" becomes "How": In person (pick a place) or Video call. Approval works as it does now. |
| Travel buffer | Decided: none. The app only counts session time, for video calls and in-person sessions alike. |
| The link | **Phase 1:** Vienne saves her own standing Meet or Zoom link in Settings, and confirmed video sessions use it unless she pastes a different one. **Phase 2:** because sign-in already uses Google, confirming a session can create a Google Meet through Google Calendar. This needs one extra permission from her account. |
| Joining | From 15 minutes before the start, a **Join call** button appears on the session drawer and on parent Home, for that family only. |
| Who joins | Decided: video sessions are 1-on-1 and the parent doesn't need to be there. The child joins from the parent's account or device; kids never get their own login or link. |
| Safeguards | Vienne admits the student from the waiting room. No recording by default. The link is hidden once the session ends. The parent sees when the call started and ended in the session history. |
| Notifications | No new notification type. The link is part of the "Session confirmed" notice parents already get. |
| Later, only if she wants it | A video call built into the app with a shared whiteboard (a hosted service such as Daily or LiveKit). Costs money and needs a privacy review for under-13s, so it isn't planned now. |

## 4b. AI help (decided: only these two)

**Model:** `claude-haiku-5-5` with `output_config.effort: "high"`. Anthropic recommends high for Haiku 5.5 on strict instruction-following work. Every call uses **structured outputs** (`output_config.format: json_schema`), so the app gets fields it can check, not free text.

**Rules for both:** no chatbot and no AI wording in the interface. The result shows as **"Draft for you"** with **Use this / Change / No thanks**, and nothing saves until she taps. The server rejects any skill, test or question number that doesn't exist in her data.

### A. Voice session notes
- **Where:** the Complete session form only, as one large **Talk about it** button.
- **Flow:** tap → speak → **Done** → she sees what she said and can fix words → "Writing your note…" → a draft with three parts:
  1. **Note**, in plain sentences.
  2. **Skills worked on**, as chips with a rating she can change.
  3. **Book questions to redo**, for example "Test 2: #14, #19", added to the student's redo list.
- **Voice to text:** Claude reads text and images, not audio, so the phone's built-in dictation turns her voice into text first. That's free and needs no extra service. If it struggles with her voice, phase 2 adds a speech-to-text service on the server.
- **What the model is given:** the student's first name and grade, the session date, her skill list for that grade, the book map for that grade (valid test and question numbers) and what she said.
- **Schema:** `{ note, skills: [{ skillId, rating }], redo: [{ test, number }], unsure: [string] }`. Anything in `unsure` shows as "Check this" in yellow.

### B. Book setup from photos
- **Where:** Content → Book → grade → **Set up from photos**.
- **Flow:** photograph one answer-key page at a time, with a framing guide → the app reads it → a table appears next to the photo with test, number, answer, format and suggested standard. Rows it isn't sure about are yellow. She fixes any cell and taps **Save this page**.
- **Standards:** to suggest a standard, she can also photograph the question page. The photo is used once to read it and then deleted. Only the answers and tags are kept, never the question text or the images.
- **Checks:** each test's question count must match before it saves, answers must fit the format (a letter for multiple choice, a number or fraction for numeric) and she reviews every page.
- **Schema:** `{ test, items: [{ number, answer, format, benchmarkCode, confident }] }`. `benchmarkCode` must be one of that grade's codes.

**Quality check before launch:** run both features on her real pages and a few of her real voice notes. If Haiku misreads a page, show her the photo and the blank row rather than guessing.

**Also kept from the ease-of-use list:** larger default text and buttons on her screens with a text-size setting, "Deleted. Undo" instead of tap-twice confirms, and Today as her one list of what needs her.

## 5. Contract changes (for CONTRACT.md once approved)

- `Session`: + `mode`, + `meetingUrl`; `locationId` becomes nullable.
- `AvailabilityRule`: + `modes[]`. `Settings`: + `defaultMeetingUrl`, + `fastWindows[]`.
- `Student`: + `school`, + `schoolYear`. New `FastResult { studentId, testType, window, scaleScore, level, categories[] }`.
- New `Benchmark`, `ReportingCategory`; `Skill.benchmarkCodes[]`; `Question.benchmarkCodes[]`; `Question.type` + `NUMERIC`, `MULTI_SELECT`, `MATCH`.
- `Assignment.kind` + `BOOK` with `bookRef { title, grade, chapter, pages, problems }`; + `PRACTICE_TEST` with `blueprintGrade`.
- New server modules: `fast.js` (results, windows), `benchmarks.js`. `getOpenSlots` takes `mode`.

## 6. Questions for Vienne before we build

1. ~~Book~~ Florida Test Prep F.A.S.T. Mathematics, one per grade. Waiting on Vienne for the access code, which unlocks the book's online content.
2. Does she want K–2 tracked against Star Math too, or only grades 3–6 against FAST?
3. Video: does she already have a Zoom or Meet link she likes? ~~Travel time~~ None: only session time counts (decided).
4. Will parents enter FAST scores, or will she? (Parents have Family Portal access; she may not.)
5. Should practice tests be timed for the kids, or untimed with the time shown only to her?

## 7. Suggested order

1. Math-only plus Miami-Dade demo data (small, changes how the demo feels right away).
2. Optional video, phase 1 (pasted link).
3. Benchmarks taxonomy and question tagging.
4. Book assignments, FLDOE links and FAST results on the student page.
5. Practice-test mode and reports by reporting category.
6. Google Meet auto-links.

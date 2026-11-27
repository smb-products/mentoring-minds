# Design: how the app looks

The look for launch, approved by Javaris on 2026-11-27. Tickets R1–R3 restyle the app to it, and L1 builds the
landing page with it. This file is the spec. If it disagrees with a screen, the screen is wrong.

**Direction:** clean and modern, with the restraint of a banking or health app. Calm navy, white and grays, one
blue accent, and flat surfaces. Nothing glossy or playful.

**What doesn't change:** layouts, wording, and every label, role and name a test reads. Only the look changes.
If a test breaks, the change is wrong, not the test.

## Type

- **One font: Inter** (variable), self-hosted with `@fontsource-variable/inter`. Fredoka and Nunito Sans go,
  along with their packages and the `font-display` class. Numbers use `tabular-nums` where they line up
  (times, scores, counts).
- **A named scale**, as tokens in `src/app/globals.css` (`@theme`). Screens use these names, never `text-[Npx]`.
  No type token shares its name with a color token, or `text-<name>` would set the color instead:

| Token | Phone | Desktop (≥ 768px) | Weight | For |
|---|---|---|---|---|
| `text-caption` | 12px | 12px | 500 | Badges, table heads, small meta |
| `text-small` | 13px | 13px | 400–500 | Secondary lines, hints, timestamps |
| `text-body` | 15px | 14px | 400 | Body text, list rows, buttons |
| `text-field` | 16px | 14px | 400 | Inputs, selects and textareas. Phones stay at 16px, because iOS zooms the page on focus below that. It's not called `text-input`: Tailwind reads that as the `--color-input` color and sets no size (R1's holdout) |
| `text-heading` | 15px | 15px | 600 | Section and card titles |
| `text-title` | 18px | 18px | 600 | Drawer, sheet and dialog titles |
| `text-page` | 22px | 24px | 600 | Page titles (the `PageHeader` h1). Today they're 26–36px |
| `text-figure` | 22px | 24px | 600 | Big numbers in a stat row, and the landing page's rate |
| `text-display` | 30px | 40px | 600 | The landing page's hero headline only (L3) |

- Line height is 1.45 for body and 1.25 for headings. Headings have −0.01em tracking and nothing else.
- Weights are 400, 500 and 600, never 700 (`font-bold`) or 800 (`font-extrabold`). Use 600 for headings and
  card titles, and 500 for labels such as "Open hours", "Next session", "Sessions so far", legends and day
  headers. Names and times are 500 or 400.
- Text size in Settings (`data-text` zoom: Large, Extra large) stays, on top of this scale.

## Color

- **Navy** (`--mm-brand-900/950`) for the rail, the header band and the phone nav. **White** cards on a light
  gray page. **Grays** (`--mm-neutral-*`) for text, borders and quiet surfaces.
- **One accent: blue** (`--primary`, `--mm-brand-600`). It's for primary buttons, links, focus rings, the
  selected tab and the selected nav item, and nothing decorative.
- **Status colors** (good, warning, serious, critical) are only for status: a badge, an error or an overdue
  date. They appear as a small dot or a soft tint with dark text, never a filled block.
- **Gold** (`--reward`) appears only on the stars beside a child's homework.
- **Level badges are neutral:** gray text on a light gray tint, like every other badge. The level number says
  enough. Skill meters use the accent blue.
- Dark mode keeps working: every token has its dark value, and AA contrast holds (4.5:1 for text, 3:1 for
  borders of controls).

## Shape and depth

- **Corners:** 8px for cards, panels, drawers and dialogs, and 6px for buttons, inputs, selects, tabs, chips
  and badges. Only avatars, status dots and the notification count are round.
- **No pills:** inputs, buttons, tabs and segmented controls are rectangles with 6px corners.
- **Flat:** no gradients, glows, gloss, inset highlights or 3D press shadows. This covers `surface`, `band`,
  `glass`, `chrome-*`, `press-*` and `rail`, which become flat fills or go. A card is white with a 1px
  `--border` and at most a 1px, low-opacity shadow. Drawers and dialogs may use one soft shadow.
- **Buttons:**
  - Primary is solid `--primary` with white text.
  - Secondary is white with a 1px border.
  - Ghost is text only.
  - Destructive is solid `--destructive`.
  - Hover darkens a little, and press doesn't move.

## The shell

- **Header band:** flat navy, with no brain line-art (`Masthead.jsx`'s `BRAIN_*` art goes). It holds only the
  back link, the title (`text-page`), the subtitle and the actions, so it's about 120px tall on desktop.
  A page with tabs in its band (some of Vienne's screens) adds the tab row on top of that, about 150px
  (Rigg's R3 holdout, #144).
  - Stat rows (`Figures`) and the child chips sit on the gray page below it, and nothing overlaps the band.
  - On phone Home the band ends above the child chips, and the Next session card is fully in view without
    scrolling.
- **Date tiles** (the next session's date on parent Home) are light gray with navy text, not a navy block.
- **Child chips** are 6px rectangles, like every other chip.
- **Logo:** in the app (rail, phone nav), a simple text wordmark "Mentoring Minds" in Inter 600. The brain
  logo (`LogoMark`, `/logo-*.png`) appears only on the landing page and sign-in.
- **Rail and phone nav:** flat navy. The selected item gets a lighter navy fill and white text, and the others
  are `--sidebar-foreground`. Icons are 18px with a 1.75 stroke.

## Content changes Javaris asked for

- **Stars leave the stats:** the "Stars earned" figure goes from parent Home and from Progress. Stars stay
  only beside the child's homework (the stars on each graded assignment). The server still returns
  `starsTotal`; no contract shape changes.
- No photos and no bio anywhere for now.

## Landing page (L1)

The public page at `/` for signed-out visitors. Signed-in users still go straight to their home. It uses the
same tokens. It has the brain logo, a white background and navy text, and blue only on its buttons and links.
The sections, in order:
1. **Hero:** "Math tutoring for grades K-6 in Miami-Dade, with F.A.S.T. test prep", with **Get started** and
   **Sign in**.
2. **Services:**
   - 1-on-1 Tutoring: "Individual support for students who need extra help in a subject."
   - Small Groups: "Students practice and learn alongside their peers."
   - In-Home Tutoring: "For special circumstances."
   - Online Tutoring: "For special circumstances."
3. **Rates:**
   - $50 per hour.
   - Payment: cash, Zelle, Cash App, Apple Pay, and the Step Up For Students scholarship, which links to
     `https://www.stepupforstudents.org` in a new tab (`rel="noopener noreferrer"`).
4. **How it works:** three short steps.
5. **In person or online:** no place names.
6. **Request an invite:** the form from L2.

7. **Footer:** Privacy, Sign in, and "© Mentoring Minds Academy".

**Layout:** generous whitespace, content at most about 1080px wide, and phone first (one column on a phone).
The services are a quiet 2×2 grid, one column on phones. Each service gets one 18px line icon (lucide, 1.75
stroke): plain text, no cards and no shadows. There are no photos.

**Address and metadata:** the site is `https://mentoringmindsacademy.org`.
- `metadataBase` and the canonical URL use it.
- The title is "Mentoring Minds Academy: math tutoring K-6".
- The Open Graph image is text only, made with `next/og` in the brand colors: navy background, white Inter
  text, and one blue rule.

### Landing polish (L3)

From OSA's taste review of L1 (#136). The page should read like a business, not a docs page.
- **Hero:**
  - The headline is "Math tutoring for grades K–6 in Miami-Dade, with F.A.S.T. test prep", with an en dash in
    K–6, at `text-display`.
  - Under it is one subhead line: "One-on-one and small-group math tutoring with Vienne Elliott."
  - The hero sits on a full-width light-gray band (`--secondary`, flat, no gradient), and its content is
    balanced so the right half isn't empty.
- **Header:** the brain logo at about 44px, so the mark is legible, and a **Sign in** link at top right.
- **Rates:** one quiet bordered panel (1px `--border`, 8px corners, no shadow), with "$50" at `text-figure`
  and "per hour" at `text-small` beside it. The payment methods are a plain list, Step Up For Students linked
  as before.
- **Rhythm:** sections don't all repeat h2, text and a rule, and there are no `<hr>` dividers.
  - Services stay a 2×2 grid.
  - How it works shows numbered steps 1–3, each number in a light circle. These step markers may be round.
  - "In person or online" sits on a full-width light-gray band.
- **Width:** still about 1080px at most, with wide side gutters. No photos.

### Landing v2 (L4)

Javaris, 2026-11-27: the page is still too basic. Landing v2 replaces L3's hero and layout. There are no new
facts and no made-up content: every line is something the app does today.

1. **Hero on the navy brand band** (`--ink`, flat):
   - The white headline and subhead from L3, with **Get started** and **Sign in**.
   - On the right (below, on phones), a phone-frame screenshot of a parent's Home. The frame is drawn in CSS or
     SVG. The screenshot is a static image in `public/landing/`, made by a committed script from the restyled
     app with the demo seed, so it has only demo names and no real family.
2. **Trust strip** under the hero, as one line: "Grades K–6 · Florida B.E.S.T. standards · F.A.S.T. test prep ·
   In person or online".
3. **"What families get in the app":** a 3×2 grid, each item with one line icon.
   - Book sessions online.
   - Homework with Vienne's feedback.
   - Progress reports from Vienne.
   - FAST score tracking.
   - Message Vienne directly.
   - Video sessions when you can't meet in person.
4. **Services:** 4 cards with icons, on a light-gray band. Cards here are white, with a 1px border and 8px
   corners, and no shadow.
5. **Rates and payment** beside **"In person or online"** on desktop, stacked on phones. The payment methods
   read "Cash", "Zelle", "Cash App", "Apple Pay" and "Step Up For Students scholarship" (capitalized, no "the").
6. **How it works:** numbered steps, joined by a thin connecting line (vertical on phones).
7. **Closing navy CTA band:** "Ready to get started?", with **Request an invite**, which scrolls to the form.
8. **Navy footer:** Privacy, Sign in and "© Mentoring Minds Academy".
9. **Throughout:**
   - Subtle section spacing, about 1080px wide at most, and Inter.
   - Only this file's tokens, one accent (blue), and still no gradients.
   - No testimonials unless they're real, and no photos except the app screenshot.
   - Leave a slot in the code for a later "About Vienne" section with a photo, but render nothing until Javaris
     sends its content.

## Privacy page (L1)

`/privacy` is plain language, with no legal boilerplate. It's linked from the landing footer and sign-in, and
Google's consent screen links to it too. It says:
- **What the app stores:** accounts (name, email; Google sign-in shares only those), children's first names and
  grades, sessions and Vienne's notes, homework and its photos, messages, FAST scores, and invite requests.
- **Who sees it:** Vienne, and each family only its own.
- **Where it lives:** Vercel and Neon, in the US.
- **How long:** invite requests are deleted after `REQUEST_KEEP_DAYS` (90).
- **How to delete:** a family or child is deleted on request (S23b). Backups clear within the restore window.

Javaris reviews the wording before launch.

## Checking it

Each restyle ticket adds a small source test for the files it owns:
- no `text-[Npx]`, `font-display`, `font-extrabold` or `rounded-full` on controls;
- no gradient, `chrome-*`, `glass`, `press-*` or `band` utility;
- only the scale's type tokens.

The browser suite then proves nothing a person reads or taps moved.

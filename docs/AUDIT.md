# UX and rendering audit

How it was checked: `scratch/audit.py` loads every route at 7 viewports (360, 390, 430, 768, 1024, 1280, 1440 wide). For each page it checks for horizontal overflow, clipped text, tap targets under 36px (on phones), interactive elements nested inside other interactive elements, axe-core accessibility rules and console errors. It also opens 13 drawers, sheets and popovers at 4 viewports and checks their position, document scroll, whether the heading is visible and whether focus moved into them. `scratch/repro2.py` simulates the iOS sheet bug.

## Results

| Check | First run | Now |
|---|---|---|
| Horizontal overflow | 0 | 0 |
| Nested interactives | 4 | 0 |
| axe issues (distinct) | 9 rule types | 0 |
| Phone tap targets under 36px | 89 | 0 |
| Overlays that failed | 5 (quiz focus, popover focus/heading, phone account) | 0 |
| Console errors | 0 | 0 |
| Clipped text | 144 | 48, all intentional (message previews, dense week-grid blocks) |

## The reported bug: the phone sheet rendered stuck at the top

**What happened:** tapping a student opened the session sheet, but it showed up pinned near the top of the screen instead of sliding up from the bottom.

**Cause, in three parts:**
1. The root used `height: 100%`. On iOS that is taller than what you can see while the URL bar is showing, so the document could scroll.
2. When the sheet opened it called `panel.focus()`, and the browser scrolled the document to bring the panel into view. That moved everything by about 144px.
3. The overlay host was `absolute` inside the scrolled page, so it moved along with it.

**Fix:** a `100dvh` root with `overflow: hidden` and `overscroll-behavior: none`; `focus({ preventScroll: true })` everywhere; on phones the overlay host is `fixed`. Checked: the document stays scrolled to 0 and the sheet's bottom edge sits on the bottom of the screen.

## Other fixes

- **Request rows at 1024px:** names were cut to "Jordan …" and the notes wrapped one word per line. The row measured the page instead of its own half-width column. It now sizes itself to its column, so the actions move under the content when space runs out.
- **Day timeline:** short sessions hide the time instead of showing "10:00 …". Screen readers still hear the name, time and subject.
- **Content library on phones:** titles and descriptions wrap to two lines instead of being cut off.
- **Segmented controls:** options keep their natural width and the group scrolls sideways, so "Published" no longer gets squeezed.
- **Tap targets:** all phone controls are at least 37.5px tall (the root font size is 15px). Inline text links get an invisible `hit-area` that extends their tap area.
- **Focus:** drawers, popovers and the quiz move focus inside when they open, keep Tab inside, close on Escape, and return focus to the button that opened them.
- **Destructive actions** (delete resource, revoke code, remove time off, archive skill or question, pause account) ask for a second tap within 3.5 seconds.
- **Swipe down** on a phone sheet's handle or header closes it.
- **Loading and errors:** pages show a skeleton while data loads instead of a blank screen. A failed query throws to the page's error boundary instead of rendering nothing.
- **Accessibility:** landmarks (`main`), labels on file inputs, `role="log"` on message threads, `role="img"` on colour-only squares, h2 titles on popovers, and accessible names that match the visible text.
- **Family page:** "Message" comes first among the header actions. The private notes box grows to fit its text.

## Known limits

- WebKit can't be installed here (the Playwright download is blocked), so Safari was simulated in Chrome with the iOS viewport behaviour. Check once on a real iPhone.
- Message previews and week-grid blocks are truncated on purpose. The full text is one tap away.

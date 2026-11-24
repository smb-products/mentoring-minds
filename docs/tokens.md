# Mentoring Minds — design tokens

Palette: **navy brand** (logo) + **gold reward**, one navy-tinted neutral, four status hues, four chart series. Ramps are built in OKLCH (50–950); hex lives only in `globals.css`. Contrast: see `contrast-report.md` (118 pairs, 0 failures).

| Token | Job | Light | Dark |
|---|---|---|---|
| `--primary` / `-foreground` | The ONE forward action per screen (Book, Approve, Submit) | brand-600 / white | brand-600 / white (+ ring edge) |
| `--brand` | Links, counts, eyebrows, selected text | brand-700 | brand-300 |
| `--brand-soft` / `-foreground` | Selected/tinted backgrounds, avatars | brand-50 / brand-800 | brand-950 / brand-200 |
| `--ink` / `-foreground` / `-muted` | Masthead band, date tiles, toasts, text on navy | brand-950 / white / brand-200 | brand-900 / white / brand-200 |
| `--reward` / `-foreground` / `-edge` | Stars, invites, celebrations (always with a star/icon) | gold-400 / brand-950 / gold-600 | same |
| `--reward-soft` / `-foreground` | Reward tints | gold-50 / gold-800 | gold-950 / gold-200 |
| `--background` | Brushed-silver work surface | neutral-100 | neutral-900 |
| `--sidebar` | Navy rail and the frame around the work surface | brand-950 | brand-950 |
| `--sidebar-foreground` | Rail icons and labels | brand-200 | brand-200 |
| `--sidebar-primary` | Active rail pill, rail count badges | white | brand-300 |
| `--sidebar-accent` | Rail hover | brand-900 | neutral-800 |
| `--card` | Cards | white | neutral-800 |
| `--popover` | Menus, sheets, popovers | white | neutral-800 |
| `--muted` | Wells, chips, segmented tracks | neutral-200 | neutral-700 |
| `--border` | Decorative dividers and card edges | neutral-200 | neutral-800 |
| `--input` | Form field borders (≥ 3:1) | neutral-500 | neutral-500 |
| `--foreground` | Body and headings | neutral-900 | neutral-50 |
| `--muted-foreground` | Secondary text | neutral-700 | neutral-300 |
| `--subtle-foreground` | Tertiary text, meta | neutral-600 | neutral-400 |
| `--ring` | Focus ring (2px + 2px offset) | brand-500 | brand-400 |
| `--good` · `--warning` · `--serious` · `--critical` | State only: confirmed · due soon · late · declined/error | 700 · 500 · 600 · 600 | 400 each |
| `--*-soft` / `--*-soft-foreground` | Status badges, tints | 50 / 800 | 18% of 400 over card / 200 |
| `--destructive` | Irreversible actions | critical-600 | critical-400 |
| `--chart-1…4` | Subjects: Math · Reading · Writing · Phonics | blue · teal · violet · brick | lighter set |
| `--chart-seq-*` / `--chart-div-*` | Sequential (brand) / diverging (brand ↔ gold, gray mid) | | |

Dark mode is "midnight": a deep navy frame (rail + masthead) around slate cards. It is its own token set, not an inversion.

## Do
- Use semantic classes only: `bg-card`, `text-muted-foreground`, `bg-primary`, `ring-ring`.
- One primary button per screen; everything else is `secondary` or `ghost`.
- Depth comes from the logo: `band` (glossy navy masthead), `surface` (top-lit silver cards), `chrome-primary` / `chrome-secondary` buttons, `glass` tiles on navy. These utilities live in `globals.css`.
- Radius steps with hierarchy: work surface 20px, sections 14px, controls 10px, tags 6px. Shadows only on things that float (popovers, drawers, toasts).
- Pair every status color with an icon **and** a word ("Late", "Confirmed").
- Gold means reward. Always show it with a star or celebration icon.
- Nunito Sans everywhere. `font-display` (Fredoka) only for the wordmark and the kids' quiz.
- Status badges always carry a word and a shape (dot, ring, bar, check).

Dark mode is "midnight": a deep navy frame (rail + masthead) around slate cards. It is its own token set, not an inversion.

## Don't
- No hex, rgb or Tailwind palette colors (`blue-500`) in components.
- Don't use status colors for decoration, subjects or charts.
- Don't use `--reward` for warnings, or `--warning` for stars (they're neighbors in hue).
- Don't put body text in `--brand` on `--brand-soft` at small sizes; use `--brand-soft-foreground`.
- Don't invent a new color for a one-off. Find the token whose job fits.

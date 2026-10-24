# Design decisions

Recorded 2026-10-24 during the design intake step. Source of truth: prd.md section 11 (design rules) and DESIGN.md (skill routing). DESIGN.md overrides the PRD's Taste direction step, so direction is fixed by the PRD. Emil applies only to the functional motion list. Impeccable runs the critique, audit and polish passes at each milestone verify step.

## Typography

- Headings: Newsreader. Interface text: Source Sans 3. Citations, code and technical values: JetBrains Mono. Loaded with next/font so they self-host at build time.
- Type scale in globals.css: 14 / 16 / 18 / 22 / 30 / 44. Body 16px with line height 1.55. Reading views cap at 68 characters.
- None of the three banned fonts appear anywhere, including fallbacks (the create-next-app scaffold shipped Geist and was replaced).

## Color

- Tokens live in globals.css. Light: background #F6F3EC, surface #FFFFFF, text #1B1A17, muted #5E5A50, border #DDD7C9, accent #1F5F4A, highlight #F3E3A3, error #A3392B, warning #8A5A12.
- Dark mode currently follows prefers-color-scheme with the PRD values (#1C1B18, #252420, #ECE8DF, #A39E92, #3A3830, #5DB594, #5B4F1C, #E08A7B). The manual light/dark toggle is the theme task.
- Success reuses the muted accent family, warning is muted, no neon anywhere.
- An accent contrast token keeps primary button text legible in both modes.

## Components

- Forms (auth screens): single column, native labels above fields, plain-language errors directly under the field, server messages in a left-bordered notice block. No illustration on auth screens, per the screen table.
- Buttons: primary uses the accent fill, secondary uses the surface; 100ms press scale to 0.97; hover changes color instantly with no transition; visible focus ring; disabled while pending.
- Corner radius 6px everywhere. Spacing on the 4px base scale.
- Citation gutter, manuscript highlight and stage label styles are defined in globals.css and get used when the reader, answer and ingestion views land.

## Motion (functional list from prd.md)

- Button press scale (100ms) ships now, disabled under prefers-reduced-motion.
- The rest arrive with their features: citation reveal underline (160ms ease-out), cited-page highlight fade (180ms), stage label crossfade (100ms), streaming text block cursor (700ms blink). No continuous animation, no scroll effects, no decorative motion.

## Copy

- Plain language. Say what happened, why, and what to do next. No hype, no exclamation marks, no em dashes, no emoji. Sentence case in headings, buttons and labels.

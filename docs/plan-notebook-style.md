# Notebook restyle plan

Owner request 2026-10-28: turn DocuMind notebook styled. This is an extension of the
incumbent warm paper world (design-decisions.md), not a replacement: the PRD palette,
fonts, 6px radius, hairline borders and the 17 banned patterns all still hold. The
notebook character comes from ruling, margins and ledger rules drawn with hairlines,
which the PRD allows ("hairline rules only where structure needs them").

## Direction

A composition notebook, not a skeuomorphic one. Four signatures, all hairline weight:

1. **Ruling.** The page background carries horizontal rules on a 28px rhythm at very
   low contrast (ink at 14 percent). Opaque surfaces (tables, forms, buttons) sit on
   top of it like pasted sheets; transparent areas (hero, conversation, gutters) show
   the ruling, which is where the character reads.
2. **Margin rule.** A single muted red hairline (the error token, hue 7, used as a
   structural line not a status) runs down the left of every content column, 14px
   before the text starts, exactly where a notebook puts it. Themed for dark mode.
3. **Writing on lines.** The ask composer textarea carries its own ruling aligned to
   the 16px/1.55 line box, scrolling with the text (background-attachment: local), so
   the question is written on the line.
4. **Ledger headers.** Data tables get a 3px double rule under the heading row, the
   exam ledger treatment, instead of the single hairline.

Not doing: spiral bindings, punch holes, tape, handwriting fonts, offset shadows
(craft floor refuses costume block shadows). Highlighter citations already exist and
stay as they are.

## Phases

### Phase 1 (this pass): system layer
- globals.css: `--rule` and `--margin-rule` tokens in all three theme blocks, body
  ruling, `.margin-rule` utility with `--margin-left` override, `.input.lined` for the
  composer, ledger rule on `thead tr.border-b`.
- Apply `.margin-rule` to every page column: landing, library, account, admin (both
  mains), the ask thread, and the auth form columns (which use a negative
  `--margin-left` because their text starts at the column edge).
- ask composer textarea gets `lined`.
- Gates: lint, lint:design, build, browser check in light and dark at 1280 and 360,
  impeccable detect, web-design-guidelines on changed files.

### Phase 2: surfaces
- Landing hero reads as the open page (stronger ruling inside the column, heading
  treatment).
- Empty states and notices sit on ruled sheets.
- Auth pages: ruling behind the form column, ledger rule where lists appear.
- Evaluation and account sections: any remaining flat panels pick up the sheet rules.

### Phase 3: verification sweep
- Screenshots at 360/768/1280 in both themes, contrast check on the ruling itself,
  reduced motion untouched (no new motion), Lighthouse a11y re-run on changed pages,
  full web-design-guidelines pass, impeccable detect, decisions recorded, commit.

## Rules kept

- No new hues: ruling is ink alpha, margin rule is the existing error red, everything
  else is the existing palette.
- No transitions in hover rules, no blur, no gradients other than the linear ruling
  (lint:design bans radial only), no banned fonts, no em dashes, no emojis.
- The margin rule is decorative structure at 1px, which the craft floor allows; the
  PRD status-only reading of the error token is recorded here so the owner can veto
  the red line at review and it swaps to `--border` with one token change.

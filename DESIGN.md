# Design Skill Routing Rule

Before any UI task, classify it, then load the smallest set of skills that covers it.
Never load every skill by default.

## Source of truth
- If `PRODUCT.md` / `DESIGN.md` / `.impeccable/` exist, the design direction is already decided.
  Do NOT run Taste's direction step. Work inside the existing system.
- If none exist and the project is new, run `/impeccable init` once to record product context.

## Skill ownership
| Skill | Owns | Cost |
|---|---|---|
| `design-taste-frontend` (Taste) | Visual direction for NEW public-facing surfaces: art direction, imagery, browser-verified build | Very high (30-45 min, hundreds of K tokens) |
| `/impeccable <cmd>` | Design system and quality loop: shape, critique, audit, polish, typeset, layout, colorize, harden, distill | Low per command |
| Emil's skills | Interaction feel and UI engineering details | Low |
| `web-design-guidelines` (Vercel) | Rule-based compliance audit of code: a11y, focus, interaction, UX consistency. Output is `file:line` findings. | Very low |

## Route by task

### New landing page / marketing site / showcase surface, no existing identity
1. `/impeccable init` (if no PRODUCT.md)
2. Taste: sets direction and builds
3. `/impeccable critique` → `/impeccable polish`
4. Emil `animate` / `review-animations` only if motion needs more than Taste produced
5. `web-design-guidelines` on the changed files

### New dashboard / app screen / settings / admin view
- Taste v2.1 has an app-screen route, but use it only if no design system exists.
- Otherwise: `/impeccable shape` → build → `/impeccable audit` → `polish`.
- Add Emil `break-ui` (worst-case data) and `mobile-native` if it ships to phones.
- Finish with `web-design-guidelines`.

### Existing UI that looks generic or "AI slop"
- `/impeccable critique` first. Then targeted commands (`typeset`, `layout`, `colorize`, `bolder`, `quieter`, `distill`).
- Escalate to Taste only if the whole visual direction must be replaced, not tuned.

### Existing UI, quality unreviewed, pre-ship
- `/impeccable audit` → `harden` → `polish`, then `web-design-guidelines`.
- Run `npx impeccable detect <path>` for deterministic anti-pattern checks.

### Compliance check ("review my UI code", "check against web standards", "audit accessibility")
- `web-design-guidelines` alone, scoped to the named files. If no files are named, ask which.
- Add Impeccable `critique` only if the user also wants design judgment.

### Motion and interaction
- Build a new animation: Emil `animate` (React Native/Expo: `animate-expo`)
- Review existing animation: Emil `review-animations`
- Find where motion belongs: Emil `find-animation-opportunities`
- Codebase-wide motion audit: Emil `improve-animations`
- Dropped frames / jank: Emil `animation-performance`
- General easing, duration, press/hover feel: Emil `emil-design-eng`
- Light motion as part of a broader pass: `/impeccable animate`
  Emil wins whenever the task is specifically about animation.

### Other Emil triggers
- Feels like a website, not an app, on mobile: `mobile-native`
- Choosing a toast/modal/component library: `pick-ui-library` (never hand-roll)
- Sonner toasts: `ask-sonner`
- Exploring several UI variants: `prototype`
- Apple-style fluidity: `apple-design`

### No skill
- Logic-only, backend, or copy-only changes with no visual effect.
- One-line style fixes (a color, a margin). Just do it.

## Ordering (when more than one applies)
direction (Taste) → structure/system (Impeccable) → motion (Emil) → edge cases (Emil `break-ui`, Impeccable `harden`) → `polish` → compliance gate (`web-design-guidelines`)

## Always-on gate
- After any task that edits UI files, run `web-design-guidelines` on the changed files only,
  never the whole repo. Fix findings before reporting done.
- Skip it for non-visual changes.

## Conflict resolution
- Existing `DESIGN.md` beats Taste's direction. Taste never overrides established tokens.
- Accessibility findings from `web-design-guidelines` beat stylistic choices, including DESIGN.md
  and Emil's motion. Fix them unless the user explicitly overrides.
- Stylistic findings (spacing, typography preferences) defer to DESIGN.md. Don't "fix" intentional design.
- Overlap on animation: Emil's rules win on feel; `prefers-reduced-motion` always wins.
- Overlap on typography/layout/color: Impeccable wins.
- Overlap on a11y/performance checks: run Impeccable `audit` for broad quality, `web-design-guidelines` for rule-by-rule lines. Don't duplicate fixes already made.
- Restraint beats flourish: remove anything that doesn't serve clarity or feel.

## Preconditions and budget
- Taste needs Node 22+, Chrome/Edge/Chromium, and network access for images.
  If unavailable, skip Taste and use `/impeccable shape` + `craft`.
- `web-design-guidelines` needs network access and a fetch tool to pull the latest rules.
  If offline, say so rather than reviewing from memory.
- Get user confirmation before starting a Taste build given its cost.
- Keep each response to one line stating which skill ran and why, then proceed.
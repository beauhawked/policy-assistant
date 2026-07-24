# Policy to Action — Full-Stack UX and Design Audit

Date: July 24, 2026
Scope: The complete redesigned interface (chat-first workspace), audited against the high-fidelity design handoff (design_handoff_policyiq_rebuild), plus stylesheet system, component architecture, accessibility, mobile behavior, and information architecture.
Method: Line-level review of policy-assistant-app.tsx (4,924 lines), globals.css (2,637 lines), layout.tsx, page routes, and both desktop and mobile design prototypes, by three parallel specialist reviews (design spec, implementation, stylesheet) synthesized into this report.

---

## Executive Summary

The redesign is a genuine leap. The chat-first information architecture, evidence drawer, unified Library, and design token system are the right product decisions, and the implementation is unusually faithful to the handoff: the token layer is a near byte-perfect transcription of the spec, the high-contrast mode is complete, status is shape-coded rather than color-only, reduced motion is honored, and there is not a single inline style across nearly five thousand lines of JSX. This is high-quality work.

The audit found two critical defects, one of which means the app has likely never been seen in its intended typeface; a cluster of high-priority gaps concentrated in three areas (the pinning feature, the first-run wizard, and phone-width layouts); measurable accessibility contrast failures inherited from the design spec itself; and roughly 20 percent migration residue from the old design still shipping. Every finding has a concrete fix, and the majority are small.

---

## The Goods (preserve these)

1. Information architecture. The rail-plus-views model (Assistant, History, Pinned, Library, Add source) is clean, learnable, and correctly implemented, including the subtle spec behavior where clicking Assistant while already there starts a new question.
2. Design token discipline. Every spec color, radius, shadow, and glass value is present and exact. Zero inline styles. Only three !important declarations in the whole stylesheet, all inside the reduced-motion block. Specificity is flat and sane.
3. High-contrast mode. Complete token override set, glass collapses to solid, links underline, focus ring widens to 3px, persisted with a no-flash inline script. Better than most commercial products.
4. Shape-coded status. Good = circle, warning = triangle via clip-path, always paired with a text label, with the intent documented in a comment. Exactly right for color-blind users.
5. Accessibility groundwork. Fifty aria usages: aria-current on the rail, aria-pressed on toggles, screen-reader-only labels on icon buttons in the Library and History, aria-live feedback regions, labeled form fields, decorative SVGs hidden. Tooltips appear on keyboard focus, not just hover.
6. Motion respect. prefers-reduced-motion neutralizes all animations and transitions globally.
7. Evidence-first answer design. Citation chips opening a grounded evidence drawer, with the exact source text, is the product's signature interaction and it works.

---

## Critical Findings (P0 — fix before anything else)

### P0-1. The body typeface is almost certainly not rendering
globals.css defines `--font-ui: var(--font-sans), "Instrument Sans", ...` on :root, but the next/font variables are attached to body, not html. By CSS custom-property rules, the declaration is invalid at computed-value time on html, so body text falls back to the browser's default serif. Headings escape by accident (the body class re-declares the display variable). Net effect: headings render in Schibsted Grotesk, everything else likely renders in Times. Fix is one line: move the font variable classes from body to html in layout.tsx, and give the var() references fallbacks. Verify in a browser first; this single fix will change the perceived quality of every screen.

### P0-2. Focus rings deleted on the two most-used inputs
`.piq-composer textarea` and `.piq-search input` both declare `outline: none` with no compensating focus-within treatment. Keyboard users cannot see focus in the chat composer or library search. Fix: remove both, add `:focus-within` outlines on the containers.

---

## High-Priority Findings (P1)

### Pinned answers do not survive a reload
Pins are stored in localStorage keyed by client-generated message ids that change every session; reloaded messages get different ids. Pin an answer, refresh, and the star is gone; pin again and a duplicate is created that can never be unpinned from chat. The spec calls for server-side persistence per user and dataset. Fix properly: a pinned_answers table and small API, keyed to conversation message ids (which are stable), replacing the localStorage layer. The evidence drawer is also missing its specified "Pin this answer" button.

### The first-run wizard defeats its own steps
The wizard shows only while zero datasets exist, but importing a dataset is step 1, so steps 2 (handbooks) and 3 (try a question) unmount the moment step 1 succeeds. "Skip for now" is also not persisted, so refreshing resurrects the wizard. Fix: drive wizard visibility from a persisted completed/dismissed flag, not from dataset count.

### No dataset switcher exists
The Library tags the active dataset but offers no way to change it. A district with two policy datasets can never query the second. Add a "Set active" affordance on Library rows (or a switcher in the chat header sources pill).

### Default palette fails WCAG AA on secondary text
Measured: --muted (#8296a8) on white is 3.06:1 and is the most-used secondary text color (metas, notes, table headers); --good as bold numeral text is 3.41:1; the auth footnote is 3.03:1 on navy. These are spec values, so this is a design-system decision to make: darken the tokens slightly (recommended: --muted toward #6b7f92) or formally accept with HC as mitigation. For a public-sector product, AA in default mode is the safer market position.

### The Retrieval Debug panel ships to end users
Developer instrumentation (match scores, internal mode names) renders under the composer for everyone. Gate it behind an env flag or an account-menu developer toggle.

### Answers can render with no prose
Only "general" sections render as answer text; if the model returns everything under policy/handbook headings, the card shows chips and actions with no narrative. Add a fallback that renders the summarized sections as prose when no general section exists.

---

## Mobile Findings (P1 for launch on phones)

1. The mobile header overflows below ~390px (brand + wordmark + sources pill + two buttons exceed the viewport; no wrap, no ellipsis). Hide the sources pill below 400px and add min-width guards.
2. The import preview grid never collapses; on a phone the policy text column is about two words wide. Stack it at 768px.
3. The Library table hides its header at 980px, leaving five stacked values with no labels (and the actions cell spans only three of five rows). Add per-cell labels via data-label/::before.
4. The evidence bottom sheet covers the bottom tab bar with no scrim and only a small close button. Give the rail a higher z-index or add a scrim and swipe/Escape dismissal.
5. The mobile tab bar renders all five nav items; the mobile spec calls for three (Ask, Library, History). Decide: hide Pinned and Add source behind Library/overflow on phones, or accept five.
6. Tooltips fire on touch and the right-side rail variants render off-viewport. Wrap tooltip rules in @media (hover: hover) and drop the side variant at mobile widths.
7. The missing-source warning banner specified inside mobile answers exists only in the Library view.

---

## Accessibility Findings (beyond P0-2)

1. No Escape-key handling and no focus management anywhere: the evidence drawer and account menu cannot be dismissed or entered by keyboard conventionally; focus does not move in on open or return on close.
2. The drawer close button (✕) and both avatar buttons have no accessible names (tooltips are CSS-only and invisible to assistive tech). Add sr-only labels, matching the pattern already used in the Library.
3. The Library "table" is divs with no table/row/cell roles; column association is lost entirely for screen readers.
4. New assistant answers are not announced: the message list needs role="log" or an aria-live region (the pending stub announces, the real answer does not).
5. File inputs are visually hidden but remain in tab order with an invisible focus ring; dropzones themselves are not keyboard-operable.
6. Filter pills and source tabs are visually tabs but semantically unrelated buttons: add aria-pressed or proper tablist semantics.
7. window.prompt used for rename is a poor pattern for both UX and AT; replace with inline edit, as the old UI had.
8. Decorative glyphs (arrows, plus signs) sit inside accessible names and are read aloud.
9. No print styles for the workspace: printing an answer for a board packet yields one clipped page with navy furniture. Add a print block that unpins heights and hides rail/composer/drawer.
10. No prefers-contrast: more media query to auto-engage HC; no forced-colors handling (the status triangle becomes a solid block in Windows High Contrast).

---

## Code Health Findings (P2)

1. One 3,600-line component with ~60 useState hooks and three divergent copies of session-reset logic (each forgetting different fields, so stale data can survive re-auth). Extract views into components and centralize reset.
2. All six views are constructed on every render then five discarded; the Library recomputes filters on every composer keystroke. Memoize or conditionally construct.
3. Ten parallel status/error string pairs funneled manually into three feedback blocks; several errors surface in views where they are not rendered (reference failures set chat error while on library; dataset load failures render only inside Add source).
4. False empty states: Library and Pinned show "no items" while data is loading; add loading flags.
5. Small correctness items: conversation delete missing 401 handling and URL encoding; clipboard copy on policy detail lacks a catch; "Download CSV" exports only sample rows; revokeObjectURL called synchronously after click; parseNumberedSteps renumbers wrapped lines.
6. Migration residue (~20 percent of the stylesheet plus three orphaned files): the old /policies scraper route and panel (explicitly absorbed by Add source), the orphaned accessibility-toggle component and its legacy storage key and duplicate CSS selectors, and the legacy document-library pages which are now unreachable from the UI.
7. One missing CSS rule: .piq-preview-name is used but undefined. One dead hook: data-view attribute never consumed.

### A product decision hiding in item 6
The full-document Library pages (View Full Policies, View Handbook) built earlier no longer have any entry point in the new UI. The new policy detail view partially replaces the policy reader, but the full handbook reader is now orphaned. Recommend: relink them (a "Open full library view" link from Library, and a handbook equivalent of the policy detail view), restyled onto piq tokens, rather than deleting a capability administrators valued.

---

## Spec Deviations Worth a Decision (P3)

Search field 260px vs spec 240px; actions column 112px vs 96px; sources pill border --line vs white/70; a third Rename row action beyond the spec's two; import platform detection rendered as a manual select rather than auto-detection display; policy detail Related card lacks real cross-references; drawer cannot be reopened after close except via a chip (consider an Evidence toggle in the chat header); Enter submits with no Shift+Enter newline documented (the composer is a textarea, verify multiline behavior); History rows lack per-conversation delete in the new UI though the endpoint exists.

---

## Prioritized Execution Plan

P0 (do first, tiny, transformative): font variable fix; restore focus rings.
P1 (before participants): server-side pins with stable ids plus drawer Pin button; wizard persistence logic; dataset switcher; contrast token decision; gate debug panel; prose fallback for answers; the seven mobile fixes; Escape/focus/name fixes on drawer and menus; announce new answers.
P2 (hygiene sprint): delete /policies route and scraper panel and legacy CSS; delete accessibility-toggle and legacy contrast key; relink or fold the document library pages; consolidate reset logic; loading states; the small correctness items; add workspace print styles.
P3 (polish): spec deviation decisions, tablist semantics, forced-colors and prefers-contrast handling, named z-index scale, tokenize remaining hexes.

---

Audited at working-tree state of July 24, 2026 (uncommitted redesign in progress on top of commit d1747dd). This report supersedes visual-layer portions of prior audits; the security audit of July 14 remains in force for backend matters.

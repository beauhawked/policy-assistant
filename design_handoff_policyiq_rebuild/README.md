# Handoff: PolicyIQ — School District Policy Assistant UI Rebuild

## Overview
A full UI revamp of the Policy-to-Action platform (Next.js app under `src/app` + `src/components/policy-assistant-app.tsx`). It replaces the current two-panel upload-heavy layout with a chat-first workspace: a dark navy icon rail, a grounded-answer chat with an evidence drawer, a Library that absorbs uploads AND the scraper ("Add source"), pinned answers, guided first-run setup, and accessibility features (high-contrast mode, shape-coded status, tooltips).

## About the Design Files
The files in this bundle are **design references created in HTML** — interactive prototypes showing intended look and behavior, **not production code to copy directly**. The task is to recreate these designs inside the existing Next.js/React codebase (`Policy-to-Action`), reusing its existing API routes, state logic, and data flow in `policy-assistant-app.tsx`, and replacing the presentation layer (`globals.css` + JSX structure). All backend behavior (auth, uploads, chat, scraper, conversations) already exists — this is a re-skin + information-architecture change, not a rebuild of functionality.

## Fidelity
**High-fidelity.** Colors, type, spacing, radii, and interactions are final. Recreate pixel-perfectly. (`Wireframes.dc.html` is the earlier lo-fi exploration — reference only, ignore for implementation.)

## Design Tokens
Implement as CSS variables on `:root` (replacing the current token set in `globals.css`), with a `.hc` (high-contrast) override class on `<body>` or `<html>`.

Default:
- `--accent: #1273a8` (primary actions) · `--accent-deep: #0d5c85` (hover, accent text) · `--accent-soft: #eef6fb` (tinted fills)
- `--navy: #0f2c46` (rail, tooltips, user bubble on auth page)
- Text: `#16283a` base · `--text-soft: #41556a` · `--muted2: #5f7285` · `--muted: #8296a8`
- Lines: `--line: #e4eaf0` · `--line-soft: #eef2f6` · `--line-strong: #d8dee6` · `--line-mid: #c9d8e2` · chip border `--chip-line: #cfe2ee`
- Status: `--good: #2e9e5b` · `--warn: #c07f10` · warn banner: bg `#fdf6e3`, border `#f0e0b0`, text `#8a6414`
- On-navy muted: `--on-navy: #9db4c6`
- App background `#f8fafc`; panels white
- Liquid-glass chat: `--chat-bg` = layered radial gradients — `radial-gradient(circle at 12% 8%, rgba(18,115,168,.16), transparent 46%)`, `radial-gradient(circle at 88% 24%, rgba(93,182,224,.14), transparent 42%)`, `radial-gradient(circle at 45% 100%, rgba(15,44,70,.12), transparent 52%)` over `linear-gradient(180deg,#eaf2f7,#f5f9fb)` · `--glass: rgba(255,255,255,.58)` · `--glass-border: rgba(255,255,255,.72)` · `--glass-user: rgba(219,234,244,.62)`; all glass surfaces use `backdrop-filter: blur(14–16px)`

High-contrast (`.hc`) overrides: `--accent:#0a4f75`, `--accent-deep:#083c59`, `--accent-soft:#d9ecf6`, `--line:#7d8a96`, `--line-soft:#8d9aa5`, `--line-strong/--line-mid/--chip-line:#5a6b7a`, `--muted:#3d5163`, `--muted2:#33475a`, `--text-soft:#1e3346`, `--good:#1e5c38`, `--warn:#7a5000`, warn bg `#fbf3dd` / border `#7a5000` / text `#5c3d00`, `--on-navy:#d3e2ee`; glass collapses to solid (`--chat-bg:#ffffff`, `--glass:#ffffff`, `--glass-border:#5a6b7a`, `--glass-user:#eef3f7`); links underlined; `:focus-visible` outline 3px.

Type: **Schibsted Grotesk** (headings, 600–700, letter-spacing -0.01 to -0.015em) + **Instrument Sans** (UI/body, 400–600), both on Google Fonts. Base UI size 14px/1.5. Radii: 7–10px controls, 12–14px cards, 999px pills. Zero-radius nowhere (this intentionally departs from the old Modernist direction).

Focus: `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }`.

## Screens / Views

### 1. App shell — icon rail (all authenticated views)
- Fixed left rail, 60px wide, `--navy` background, full height.
- Top: 32px logo square (`--accent`, radius 8, white "P", Schibsted 700 16px), 12px gap below.
- Nav buttons 36×36, radius 9, Lucide-style 18px stroke icons (stroke-width 2): pencil (Assistant), clock-rotate (History), star (Pinned), book (Library), plus (Add source). Active: `rgba(255,255,255,.16)` bg, white icon; inactive: transparent, `--on-navy`; hover: `rgba(255,255,255,.10)`.
- Bottom: high-contrast toggle (◐ glyph, same button style, persists to `localStorage` key `piq-hc`), then 30px avatar circle (`#2a4a66`, initials `--on-navy` 11px/600).
- Clicking Assistant while already on Assistant starts a **new question** (empty thread).

### 2. Assistant (default view)
Three columns: rail · chat column (flex) · evidence drawer (280px, collapsible).
- **Chat column** background: `--chat-bg` gradient (liquid glass ambient).
- Header: glass bar (`--glass` + blur 16, bottom border `--glass-border`): thread title (Schibsted 600 15px) left; right, a sources pill — white/70 border pill, 7px green dot + "3 sources · {District}" 12.5px.
- Optional offline banner above header: warn bg/border/text, 12.5px/600, centered: "⚠ You're offline — you can read saved conversations, but new questions need a connection."
- Message list: padding 22px 28px, column flex, 18px gap, scrolls.
  - **User bubble**: right-aligned, max-width 64%, `--glass-user` + blur 14, 1px `--glass-border`, radius `14px 14px 4px 14px`, padding 11px 15px, shadow `0 4px 18px rgba(15,44,70,.07)`.
  - **Assistant answer card**: left, max-width 88%, `--glass` + blur 16, 1px `--glass-border`, radius 14, padding 14px 16px, shadow `0 6px 22px rgba(15,44,70,.08)`. Contents, 9px gap:
    - Answer prose (bold key facts, e.g. deadlines).
    - **Citation chips** row (6px gap): pill, 1px `--chip-line`, `--accent-soft` bg, `--accent-deep` text 12.5px/600, e.g. "JRA · Student records ↗". Click → opens evidence drawer with that source. Hover: accent border. Tooltip "View source".
    - **Recommended actions** block: 3px left border `--good`, 12px left padding; label "RECOMMENDED ACTIONS" (11px/600, letterspacing .06em, uppercase, `--muted`); numbered steps with green bold numerals.
    - Footer meta 12px `--muted`: "Guidance, not legal advice · Sources captured {date} · ☆ Pin · Copy".
  - New assistant messages animate in: fadeUp 0.3s ease (opacity 0→1, translateY 6px→0).
- **Empty thread state** (new question): centered — "How can I help, {name}?" (Schibsted 700 22px), subline `--muted2` "Answers grounded in {District}'s 412 policies and 2 handbooks…", then 3 starter-scenario pill buttons (white, `--line` border, hover accent tint) that submit that question.
- **Composer**: glass card (blur 16, `--glass-border`, radius 12, padding 6px + 16px left): borderless input, placeholder "Ask a follow-up, or describe a new scenario…"; right "Ask" button (accent bg, white, radius 9, padding 9/18, hover `--accent-deep`). Enter submits. Below, centered 11.5px `--muted`: "PolicyIQ can make mistakes — verify critical decisions against the cited source."
- **Evidence drawer** (right, 280px, `#f8fafc`, 1px left `--line`): "EVIDENCE" micro-label + ✕ close; white card (1px `--line`, radius 10, padding 14) with source title (600), verbatim quoted excerpt (`--text-soft` 13px), meta 11.5px `--muted` ("Revised Mar 2025 · Board policies 2026"); two full-width ghost buttons ("Open full policy" → policy detail view; "☆ Pin this answer"), `--line-mid` border, `--accent-deep` text, hover accent tint; explainer 12px `--muted`. Maps to the existing `answerEvidence` snapshot data.

### 3. History
Centered column (max 760px, padding 34/24). Title Schibsted 700 22px. Rows: full-width buttons, 1px `--line`, radius 12, padding 14/18 — title 600 + sub 12.5px `--muted` (message count, dataset, caveats like "answered without staff handbook"), right-aligned relative date. Hover: accent border + `#fbfdfe` bg. Maps to existing `conversations` list.

### 4. Pinned answers
Same page frame. Intro line: "Your district's living FAQ — answers you've saved, with their evidence frozen at pin time." 2-col grid, 12px gap; cards: 1px `--line`, radius 12, padding 16 — title 600, body 13px `--text-soft`, meta 12px `--muted` ("JICA · pinned Jul 2"). **New feature** — persist pinned message IDs per user.

### 5. Library
Max 880px. Header row: "Library" + live search input (`--line-strong` border, radius 9, 240px, "Search all 412 policies…") + accent "＋ Add source" button.
- Filter pills: active = `--accent-soft`/`--accent-deep`/600; inactive = `--line` border; last pill "Archived (n)" toggles archived list.
- **Table** (1px `--line`, radius 12): header row `#f8fafc`, 11.5px/600 uppercase `--muted` — Title · Rows · Health · Updated · Source · (actions, 96px). Rows 13.5px, 1px `--line-soft` dividers, hover `#fbfdfe`. Health is **shape-coded**: good = 9px green circle, warning = 11×10px `--warn` triangle (`clip-path: polygon(50% 0,100% 100%,0 100%)`) + text label.
- Row actions: two 30px icon buttons (1px `--line`, radius 7) — archive/restore (⤵/⤴, hover accent) and delete (🗑, hover red `#b0362a` / `#fdefed`). Delete = `window.confirm` warning that data + embeddings are removed permanently. Archive excludes source from retrieval but keeps data (maps to existing `archivedAt`).
- Archived view shows hint line + restore actions; empty state text when none.
- **Search mode**: typing replaces the table with result cards — "{n} policies match “{q}”", each card: `{CODE} · {Title}` (code in `--accent-deep`), excerpt `--muted2`, meta 12px. Click → Policy detail. Backed by the existing retrieval/reference endpoints (direct lexical search is sufficient).
- Missing-source callout: dashed `--line-mid` border card, warn triangle, "Your staff handbook hasn't been added — staff-leave and HR questions will answer from policies only." + ghost "Add it now".

### 6. Policy detail (full-text reading view)
Max 720px. "← Library" breadcrumb; code + title side-by-side (Schibsted 700 24px, code in `--accent-deep`); meta row 13px `--muted2` under 1px rule (Section · Adopted · Revised · Dataset · right-aligned "Copy" / "Ask about this policy"); body 14.5px/1.7 `#2b3d4f` with bold clause numbers; "RELATED" card at bottom (`#f8fafc`, cross-references). Reached from evidence drawer + library search. Maps to the existing reference endpoint.

### 7. Add source (absorbs the old /policies scraper page)
Max 760px. Three method tabs (flex, radius 10, padding 12/14): "Import from district website" / "Upload CSV" / "Upload handbook PDF" — active: accent border + `--accent-soft`.
- **Import**: URL input + accent "Scan"; detection line "🟢 Platform detected: **BoardDocs** · override" (auto/boarddocs/table-link/accordion-pdf, existing scraper service); preview panel (1px `--line`, radius 12): header "Preview — 412 policies found" + quality pills ("3 missing text" warn-tinted, "0 duplicates" good-tinted); rows: code (600 accent-deep) · title · truncated wording. Footer right: ghost "Download CSV" + accent "Import to Library" (uses existing import-policies preview/commit flow).
- **Upload CSV**: large dashed dropzone (1.5px `--line-mid`, radius 12, `#fbfdfe`) with auto-mapping note (Section/Code/Policy Title/Policy Wording) + "quality preview before anything is saved" line.
- **Upload handbook**: two dropzones side-by-side (Student / Staff; PDF, TXT or MD).

### 8. Sign in / Sign up / Forgot password
Split screen, no rail. Left 44%: `--navy` panel — logo + wordmark top; middle: Schibsted 700 30px "Every answer, grounded in your district's own policies." + `--on-navy` subline; bottom 12.5px "Private to your district · Sources cited on every answer". Right: centered 380px white card (radius 14, shadow `0 8px 28px rgba(15,44,70,.08)`): mode-dependent — Sign in (email + password), Create workspace (adds District name field + verification note), Reset (email only + "one-time link, expires in 60 minutes"). Full-width accent CTA; footer links switch modes. Maps to existing auth modes incl. email verification and reset-token flows.

### 9. First-run setup wizard (after signup/verification)
Top bar: logo square + "Set up your workspace" + "{District} · Step 2 of 3". Left stepper (230px): ✓ green circle for done ("Board policies — 412 imported from BoardDocs"), numbered accent-outlined circle for current ("Handbooks"), gray for upcoming ("Try a question"), joined by 2px×14px connectors; current step gets a white card w/ accent-tinted border. Right: white card (radius 14, padding 28) — step content (handbook dropzones), footer "Skip for now" ghost + "Continue" accent. Replaces the current always-visible upload forms; after setup, sources are managed only in Library.

### 10. Mobile (`PolicyIQ Mobile.dc.html`)
Max-width 430px. Header: logo+wordmark, sources pill, HC toggle, avatar. Bottom tab bar: Ask / Library / History (glyph + 10.5px label, active `--accent-deep`, min 44px targets). Ask = chat with tappable citation chip that expands an inline evidence card; incomplete-sources warn banner with "Add it" link. Library = source cards with shape-coded status + dashed "＋ Add source". History = row list. The desktop layout should collapse to this under ~768px.

## Interactions & Behavior
- **Tooltips**: every button/icon control gets a hover tooltip showing ONLY its short title (e.g. "Assistant", "Archive", "View source"). Style: `--navy` bg, white 12px/500 text, padding 6/11, radius 7, small triangle arrow, shadow `0 4px 14px rgba(15,44,70,.3)`; above the element by default, to the right of rail items. CSS `attr(data-tip)` pseudo-element pattern or a Tooltip component.
- Citation chip click → evidence drawer opens with that source; drawer ✕ closes it.
- Send (button or Enter) appends user bubble + assistant reply (existing chat API), fadeUp animation.
- High-contrast toggle: flips `.hc` class, persists `localStorage["piq-hc"]`, shared across desktop/mobile.
- Archive/restore instant; delete requires confirm dialog.
- Hovers: accent-tinted borders/fills as specified per component; all transitions ~140ms ease.

## State Management
Reuse the existing state in `policy-assistant-app.tsx`. New/changed:
- `view` (rail navigation) replaces the tab/panel logic; `authMode` already exists (login/signup/forgot/reset).
- `evidenceOpen` + `activeEvidence` (drawer); `pinnedAnswers` (new, persisted server-side per user/dataset); `highContrast` (localStorage); `librarySearchQuery`; `sourceTab` (import/csv/handbook); `setupStep` (first-run only).

## Assets
- Google Fonts: Schibsted Grotesk, Instrument Sans.
- Icons: Lucide (https://lucide.dev) — pencil, history, star, book, plus, search, archive, trash-2, x. No custom art. Replace the current logo images with the "P" logo square + wordmark, or keep the existing brand logo in the same slot.

## Files
- `PolicyIQ.dc.html` — desktop prototype, all views (switch via the rail; auth/setup reachable via defaultView prop or by following Sign in → setup). **Primary reference.**
- `PolicyIQ Mobile.dc.html` — mobile reference.
- `Wireframes.dc.html` — lo-fi exploration history (context only).
Note: `.dc.html` files use a small templating runtime; read the inline styles and structure as the spec — do not ship them.

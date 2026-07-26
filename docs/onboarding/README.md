# Policy to Action Onboarding Documents

This folder is the system of record for the onboarding suite: three audience-specific quick-start guides, the full user manual, and the video walkthrough script.

## What lives here

| File | Role |
| --- | --- |
| `Policy-to-Action-*.pdf` | The finished, distributable documents |
| `*.md` (matching names) | Content mirrors in Markdown for fast reading, review, and edit drafting |
| `onboarding-source.zip` | The canonical build kit: HTML sources, `style.css`, logo assets, the `screenshots/` library, and `render-pdfs.py` |

## How the pieces relate

The HTML files inside the source zip are the canonical layout sources; they carry the branded covers, numbered steps, callouts, and captioned figures that plain Markdown cannot express. The Markdown files mirror the same content one-to-one so wording changes can be drafted and reviewed without touching markup.

## Update workflow

1. Draft the wording change in the matching `.md` file (or just describe the change).
2. Apply the same change to the corresponding HTML file inside the source kit; the paragraph text is identical, so it is a find-and-replace.
3. If the platform's appearance changed, recapture the affected screenshot at 1208x729 and replace it in `screenshots/`, keeping the same filename.
4. From the unzipped source folder, run `python3 render-pdfs.py` (requires `pip install weasyprint`) to regenerate all five PDFs.
5. Commit the updated PDFs, Markdown mirrors, and source zip together so they never drift apart.

The fastest path in practice: hand the edit to Claude in a Cowork session, which performs steps 2 through 5 in one pass.

## Screenshot inventory

| File | Shows |
| --- | --- |
| `01-sign-in.jpg` | Sign-in screen (production) |
| `02-create-workspace.jpg` | Create your workspace form |
| `03-new-question-greeting.jpg` | Personalized question screen with scenario guidance |
| `04-answer-citations.jpg` | Answer card with citations and recommended actions |
| `05-evidence-drawer.jpg` | Evidence panel with quoted source text |
| `06-library.jpg` | Library with source health row |
| `07-add-source.jpg` | Add a source screen |
| `08-policy-detail-related.jpg` | Policy detail with Related policies chips |
| `09-history.jpg` | Conversation history |
| `10-pinned.jpg` | Pinned answers |
| `11-account-menu.jpg` | Account menu |
| `12-full-reader.jpg` | Full policy reader |

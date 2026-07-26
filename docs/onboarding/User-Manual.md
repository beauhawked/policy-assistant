![Policy to Action](logo-mark.png)

# User Manual

The complete reference for asking scenario questions, verifying evidence, and managing your district's policy workspace

Version 1.0 · Covers all features of the web platform at policytoaction.beauhawked.com

## Contents

- 1\. Accounts and Signing In
- 2\. Asking Scenario Questions
- 3\. Reading and Verifying Answers
- 4\. Pinned Answers
- 5\. Conversation History
- 6\. The Library
- 7\. Adding and Managing Sources
- 8\. Your Account and Accessibility
- 9\. Troubleshooting

## 1. Accounts and Signing In

### Creating a workspace

From the sign-in screen at **policytoaction.beauhawked.com**, select **Create a workspace**. Enter your first and last name, your district's name, your work email, and a password. After submitting, verify your email from the message the platform sends; features unlock once your address is confirmed.

![The sign-in screen](screenshots/01-sign-in.jpg)

The sign-in screen. Create a workspace, sign in, recover a password, or resend verification from here.

### Signing in and recovering access

Returning users sign in with email and password. **Forgot password?** emails a secure reset link that expires after a short window. **Resend verification** sends a fresh verification link if the original expired or went missing.

### Privacy model

Each account has its own private workspace. Your conversations, pinned answers, and uploaded sources are not visible to other accounts, including others in your district.

## 2. Asking Scenario Questions

![The new question screen with greeting and example questions](screenshots/03-new-question-greeting.jpg)

The question screen. The header pill shows which dataset answers will draw from.

### What to write

Describe the situation the way you would brief a colleague: what happened, who was involved by role, what has already been done, and what you need to decide. The platform handles multi-part scenarios and answers each embedded question separately. Longer, more specific scenarios produce more precise citations.

### Composer controls

- **Enter** submits your question; **Shift+Enter** starts a new line.
- Scenarios can be up to 8,000 characters.
- Use placeholders such as "Student A" or "a staff member" rather than real names.
- Follow-up questions in the same conversation keep the scenario's context.

### Starting fresh

Select the pencil icon in the left rail to start a new question. Your previous conversation is saved automatically to History.

## 3. Reading and Verifying Answers

![An answer card with policy summaries, citation chips, and recommended actions](screenshots/04-answer-citations.jpg)

An answer card: policy summaries, citation chips, recommended actions, and implications.

### The anatomy of an answer

- **Policy summaries** identify each policy that applies and what it requires, with the policy code and title in blue.
- **Citation chips** beneath the summaries link every source used. Selecting a chip opens the evidence panel.
- **Recommended actions** are numbered steps grounded in the cited policies.
- **Implications** explain the consequences of following or not following the cited requirements.
- The footer notes when sources were captured, plus **Pinned** and **Copy** actions.

### The evidence panel

![The evidence panel with quoted source text and Open full source button](screenshots/05-evidence-drawer.jpg)

The evidence panel quotes the exact text the answer was grounded in.

The panel shows the exact policy excerpt behind the citation, its section, and its dataset. **Open full source** opens the complete policy text. Close the panel with the X or the Escape key; the **Evidence** button in the header reopens it at any time. Keyboard users will find focus moves into the panel when it opens and returns to the citation when it closes.

**The verification habit:** Policy to Action is decision support, not a decision maker, and not legal advice. For consequential decisions, open the evidence, read the source, and confirm the guidance matches your district's current procedures.

## 4. Pinned Answers

![The pinned answers view showing a saved answer card](screenshots/10-pinned.jpg)

Pinned answers preserve guidance with its evidence, building a personal reference library.

Select **Pin** under any answer, or **Pin this answer** in the evidence panel, to save it to the Pinned view (star icon). Pins are stored on the server per dataset, so they survive sign-outs and device changes. Each card shows the original question, the answer summary, its citations, and when it was pinned. **Unpin** removes a card.

## 5. Conversation History

![The conversation history list with delete buttons](screenshots/09-history.jpg)

History keeps every conversation. Reopen to continue, or delete permanently.

Every conversation saves automatically with a title from your first question. Open the History view (clock icon), select any row to reopen it with full context, and continue asking follow-ups. The trash can permanently deletes a conversation after confirmation; deletion cannot be undone.

## 6. The Library

![The Library with source rows, filter pills, and search](screenshots/06-library.jpg)

The Library: every source, its health, and full-text search across all policies.

### Searching policies

The search field queries code, title, and full policy text across your active dataset. Results show matching excerpts; selecting one opens the policy detail view with the full text, metadata, a **Copy** action, and an **Ask about this policy** shortcut that pre-fills the composer.

### Related policies

![A policy detail page showing related policy chips](screenshots/08-policy-detail-related.jpg)

Policy detail ends with Related policies: cross-referenced and neighboring policies, one click away.

Each policy detail page ends with **Related policies**: policies cited within the text you are reading, plus close neighbors from the same section. Selecting a chip navigates directly to that policy.

### The full reader

![The full policy reader with section navigation and print controls](screenshots/12-full-reader.jpg)

The full reader presents the entire manual with section navigation, filtering, print, and Markdown export.

The overlapping-squares icon on any Library row opens the complete document in a dedicated reader with a section table of contents, filtering, **Print**, and **Download Markdown** for board packets or offline reference.

## 7. Adding and Managing Sources

![The Add a source screen](screenshots/07-add-source.jpg)

Add a source: website import, CSV upload, or handbook PDF.

### Importing policies

**Import from district website** scans your policy site (BoardDocs, table-based, and accordion-with-PDF platforms are supported, with automatic detection), then shows a preview with policy counts, sample rows, and quality signals before anything is committed. **Upload CSV** accepts a spreadsheet export with section, code, title, and wording columns, with the same preview safeguards.

### Handbooks

**Upload handbook PDF** ingests student and staff handbooks, splitting them into citable sections. Answers then draw on handbooks alongside board policies and cite the specific passage.

### Source lifecycle

- **Active:** the dataset answers draw from. With multiple datasets, use the checkmark to switch.
- **Rename:** the pencil icon changes a source's display title.
- **Archive:** excludes a source from answers while preserving it. Restore any time from the Archived pill.
- **Delete:** permanently removes a source and its content after confirmation. Prefer archiving for superseded manuals.

## 8. Your Account and Accessibility

![The account menu showing name, email, district, edit name, and sign out](screenshots/11-account-menu.jpg)

The account menu: your name, district, name editing, and sign out.

Your avatar (bottom of the left rail) opens the account menu, which shows your name, email, and district, and offers **Edit name** and **Sign out**. The half-circle icon above it toggles a high-contrast theme. The interface supports full keyboard navigation: Tab moves between controls, visible focus outlines track your position, and Escape dismisses panels and menus. Printing any conversation produces a clean document without navigation furniture, suitable for board packets.

## 9. Troubleshooting

| Symptom                               | Resolution                                                                                                                                                        |
|---------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Verification email has not arrived    | Check spam or quarantine folders; the sender is Policy to Action. Use Resend verification on the sign-in screen. Some district mail filters take several minutes. |
| Forgot password                       | Use Forgot password on the sign-in screen. Links expire quickly; request a fresh one if yours has aged.                                                           |
| Answer cites nothing or seems generic | Confirm the correct dataset is Active in the Library and that its health reads Good. Add more scenario specifics; vague questions produce vague citations.        |
| "0 sources" appears in the header     | No active policy dataset exists yet. A setup administrator should import policies via Add source.                                                                 |
| Import preview looks wrong            | Discard rather than commit. Try selecting the specific platform instead of Auto-detect, or use the CSV path.                                                      |
| Offline banner appears                | The platform detected no connection. Saved conversations remain readable; new questions need connectivity.                                                        |
| Something else                        | Note what you did, what you expected, and what happened, and contact support. Screenshots help.                                                                   |

Policy to Action User Manual, Version 1.0. Guidance is generated from your district's uploaded policies and handbooks and is not legal advice. Verify critical decisions against the cited source text.

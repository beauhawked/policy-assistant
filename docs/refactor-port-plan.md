# Finishing the PolicyIQ componentization

Written 2026-09-23 after rolling the workspace back to production parity.
Read this before resuming the UI refactor.

## Status

`main` currently runs the **2026-08-20 monolith**, which is what production
serves. Everything works. The componentization is parked, not lost.

| Where | What |
|---|---|
| branch `ui-refactor-wip` | tip of the refactor (15 components + rebuilt globals.css) |
| commit `00ccfee` | the refactor as it arrived, with the admin panel and ParentSquare scraper |
| commit `1d98904` | globals.css renamed to the new vocabulary, 182/182 class coverage |
| commit `7a7c238` | this rollback |
| `_to_delete/policy-assistant-components-*` | the 15 component files, working copy |
| `_to_delete/p2a-src-for-scraper.tgz` | verified 2026-08-20 monolith (the restore source) |

## What actually went wrong

The refactor split `policy-assistant-app.tsx` into 15 components and rewrote the
markup against a new class vocabulary. It ported the **presentation layer and
about a quarter of the behavior**.

```
handlers     33 -> 8
fetch calls  31 -> 14
endpoints    27 -> 12
```

Sixteen handler props were passed as stubs, `() => {}` or
`(e) => e.preventDefault()`. Those satisfy the prop types exactly, so
`tsc --noEmit` and `eslint` both exit 0 while every write path in the app is
dead. **Type checking cannot detect this class of regression.** That is the
single most important thing to carry into the port.

## The port table

Line numbers are in the restored `src/components/policy-assistant-app.tsx`.
Component props are the names already declared in the refactor's prop
interfaces, so the receiving side needs no changes.

| Handler | Line | Endpoint | Goes to |
|---|---|---|---|
| `handlePolicyImport` | 1535 | `import-policies` | SourceImporter `onPolicyImportSubmit` |
| `handlePolicyImportCommit` | 1604 | `import-policies` | SourceImporter `onPolicyImportCommit` |
| `handlePolicyImportDiscard` | 1669 | (local state) | SourceImporter `onPolicyImportDiscard` |
| `handlePolicyPreviewDownload` | 1675 | (client CSV) | SourceImporter `onPolicyPreviewDownload` |
| `handleUpload` | 1695 | `upload` | SourceImporter `onUploadSubmit` |
| `handleHandbookUpload` | 1885 | `handbooks` | SourceImporter `onStudentHandbookSubmit` + `onStaffHandbookSubmit` |
| `handleDatasetRename` | 1765 | (local state) | LibraryView `onDatasetRename` |
| `handleDatasetArchive` | 1788 | (local state) | LibraryView `onDatasetArchive` |
| `handleDatasetDelete` | 1810 | `datasets/:id` | LibraryView `onDatasetDelete` |
| `handleHandbookRename` | 1965 | (local state) | LibraryView (no prop yet, add one) |
| `handleHandbookArchive` | 1990 | (local state) | LibraryView `onHandbookArchive` |
| `handleHandbookDelete` | 2017 | `handbooks/:id` | LibraryView `onHandbookDelete` |
| `handleDatasetActivate` | 2575 | (local state) | LibraryView (verify wiring) |
| `handleConversationDelete` | 2241 | `conversations/:id` | HistoryView (no prop yet, add one) |
| `handleProfileSave` | 1471 | `auth/profile` | ProfileModal `onSaveProfile` |
| `handleChangePassword` | 2302 | `auth/change-password` | ProfileModal `onChangePassword` |
| `handleSignOutOthers` | 2346 | `auth/sign-out-others` | ProfileModal `onSignOutEverywhere` |
| `handleExportData` | 2371 | `account/export` | ProfileModal (no prop yet, add one) |
| `handleDeleteAccount` | 2375 | `account` | ProfileModal `onDeleteAccount` |
| `handleResendVerification` | 1391 | `auth/resend-verification` | AuthView `onResendVerification` |
| `handleResendVerificationForEnteredEmail` | 1424 | `auth/resend-verification` | AuthView (second entry point) |
| `handleAuthSubmit` | 1176 | `auth/login`, `auth/signup`, `auth/password-reset/request`, `auth/password-reset/confirm` | AuthView `onAuthSubmit` |

`handleAuthSubmit` deserves attention: the refactor's auth path never called the
two `password-reset` endpoints at all, so forgot and reset password were missing
rather than stubbed. Port all four branches.

## Bugs to fix during the port

1. **Wrong session endpoint.** The refactor called
   `/api/policy-assistant/auth/session`, which does not exist. The route is
   `auth/me`. Session restore 404'd silently, so the app always looked
   signed out.
2. **Missing brand logo.** `AuthView.tsx` renders a literal `P` glyph. The
   handoff permits either, but production uses the real mark. Restore
   `public/logo-mark.png` in that slot (see `piq-brand-logo` in the monolith).
3. **`piq-evidence-toggle` is unstyled.** Pre-existing in production, not caused
   by the refactor. Worth fixing while you are in there.
4. **`_to_delete/` needs a sweep.** It has accumulated ~200 stale git lock files
   and loose git temp objects from sandbox sessions that cannot delete files.
   `git gc --prune=now` plus removing the folder clears it.

## The CSS is already solved

Do not redo it. Commit `1d98904` contains the full rename (209 selector
occurrences across 102 class names) plus 51 newly authored classes, taking
coverage from 31/182 to 182/182, verified in-browser against the handoff
(button radius 9px, accent `#1273a8`, logo square 32px/radius 8, modal radius
14px). Cherry-pick it once the components are back:

```
git checkout ui-refactor-wip -- src/app/globals.css
```

It pairs with the new vocabulary, so it only goes back when the components do.

## Suggested order

Port one slice at a time and **exercise it in the browser before moving on**.

1. Session fix (`auth/me`), then confirm a reload keeps you signed in.
2. Scraper: scan, commit, discard, download. Test against
   `https://wwayne.k12.in.us/board-policies` (ParentSquare) and a BoardDocs URL.
3. Uploads: CSV, student handbook, staff handbook.
4. Library: rename, archive, delete for datasets and handbooks; conversation delete.
5. Account: profile save, change password, sign out everywhere, export, delete.
6. Auth: login, signup, verification resend, forgot and reset password.

## Verification protocol

`npm run check` passing is necessary and not remotely sufficient; it passed
throughout the entire broken period. Before declaring any slice done:

- Click the control and confirm a network request in DevTools with a 2xx.
- Confirm the resulting state change persists across a reload.
- For each slice, compare against production at
  `https://policytoaction.beauhawked.com`, which is the reference implementation.

A quick static check that catches stubs before you ever open the browser:

```bash
grep -nE 'on[A-Z][A-Za-z]*=\{\(?\w*\)?\s*=>\s*(\{\s*\}|\w*\.?preventDefault\(\))\}' \
  src/components/policy-assistant-app.tsx
```

Any hit is a dead control.

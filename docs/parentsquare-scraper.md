# ParentSquare Policy Scraper

Added 2026-08-25. Fourth scraper platform, built for districts whose sites run on
ParentSquare Smart Sites. Reference implementation target: Western Wayne Schools,
https://wwayne.k12.in.us/board-policies (94 policies across series A through H).

## Site anatomy this platform expects

The listing page is server-rendered. The main content stack (`main .ss-editor-content`)
holds one table whose header row is "Policy Number" | "Policy". Each data row carries the
policy code as plain text in column one and an absolute link to a detail page in column
two. Detail paths are numeric, for example `/68134_4`. Some rows are unlinked
placeholders for reserved codes (Western Wayne: A285, C575, G475). Link hosts vary
between `wwayne.k12.in.us` and `www.wwayne.k12.in.us`; the parser treats hosts as
same-site ignoring a `www.` prefix.

Detail pages are also server-rendered. The policy body is the largest
`main .ss-editor-content` block. Reading its leaf blocks (`h1..h6, p, li, td, th`) in
order yields: the policy code either alone ("A100") followed by a title block, or
combined ("C350 - STUDENT DISCIPLINE"); then the policy wording; then trailing
adoption and revision lines in any of these observed formats: `Adopted: [08/14/24]`,
`Adopted: 02/14/2024`, `Adopted: 2.14.24`, `Revised 8/14/19`. Breadcrumbs and the page
H1 sit outside the editor blocks, so they never leak into wording.

## Field mapping

Series is derived from the code letter ("A100" -> "A Policies", matching the site's own
navigation labels). Adopted Date takes the first Adopted line's date verbatim. Revision
History joins every Revised line's date with "; " (D400 carries seven of them). Wording
excludes the code, title, and trailing date lines. The CSV export adds a Source URL
column with each policy's detail page.

## Validation performed at build time

The full extraction algorithm was executed against all 94 live Western Wayne policy
pages before the TypeScript port: 0 failures, 94/94 codes matched the listing, 0 missing
titles, 0 missing wording (min 391 chars, median ~2.8k, max ~37k), and all 94 pages
yielded adoption or revision metadata. The fixture suite mirrors the observed structures.

## Commands

- `npm run verify-parentsquare` — offline fixture suite, no network or database.
- `npm run verify-parentsquare -- --live` — real scrape of the Western Wayne listing with
  a summary report; still writes nothing to the database. Run from a normal network
  (it fetches ~94 pages at concurrency 6, usually 15 to 30 seconds).
- In the app, the Policy Import panel's platform dropdown now includes ParentSquare, and
  Auto-detect resolves it (detection order: parentsquare, accordion-pdf, table-link).

## Adding the next scraper platform

Follow the same seams touched by this one:

1. New module `src/lib/<platform>-policy-scraper.ts` exporting `is<X>ListingHtml`,
   `scrape<X>Policies`, `<x>RowsToCsv`, a row type, and parse-only functions for tests.
2. `src/lib/policy-scraper-service.ts`: extend `RequestedPolicyPlatform`, add a
   `RawScrapeResult` variant, a `scrapePolicies` branch, a `normalizeRowsForImport`
   branch mapping to `NormalizedPolicyRow`, `headersForPlatform`, `formatPolicyPlatform`,
   `normalizeRequestedPolicyPlatform`, the CSV branch in `scrapePoliciesForExport`, and
   the detection order in `resolvePolicyPlatform` (most specific first).
3. `src/components/policy-assistant-app.tsx`: the `PolicyPlatform` union, the platform
   `<select>` options, and `formatDatasetSourcePlatform`.
4. Fixtures under `scripts/fixtures/` plus checks in a verify script, and an npm script.

No database changes are needed: `policy_datasets.source_platform` is free text and the
import route, preview flow, and embedding indexer are platform-agnostic.

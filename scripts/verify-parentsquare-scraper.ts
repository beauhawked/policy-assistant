import { readFileSync } from "node:fs";
import path from "node:path";

import { isAccordionPdfPolicyListingHtml } from "../src/lib/accordion-pdf-policy-scraper";
import {
  isParentSquarePolicyListingHtml,
  type ParentSquarePolicyListingItem,
  parentSquarePolicyRowsToCsv,
  parseParentSquarePolicyDetail,
  parseParentSquarePolicyListing,
  scrapeParentSquarePolicies,
} from "../src/lib/parentsquare-policy-scraper";
import {
  formatPolicyPlatform,
  normalizeRequestedPolicyPlatform,
} from "../src/lib/policy-scraper-service";
import { isTableLinkedPolicyListingHtml } from "../src/lib/table-link-policy-scraper";

/**
 * Verification harness for the ParentSquare policy scraper.
 *
 * Default (offline) mode runs the parser against fixtures captured from
 * https://wwayne.k12.in.us/board-policies — no network and no database.
 *
 * Live mode performs a real scrape of the listing URL and prints a summary,
 * still without touching the database:
 *   npx tsx scripts/verify-parentsquare-scraper.ts --live
 *   npx tsx scripts/verify-parentsquare-scraper.ts --live https://other-district.example/board-policies
 */

const FIXTURES_DIR = path.join(process.cwd(), "scripts", "fixtures");
const LISTING_URL = "https://wwayne.k12.in.us/board-policies";
const DEFAULT_LIVE_URL = LISTING_URL;

let failures = 0;

function check(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${label}${detail ? ` -> ${detail}` : ""}`);
  }
}

function listingItem(item: ParentSquarePolicyListingItem): ParentSquarePolicyListingItem {
  return item;
}

function readFixture(name: string): string {
  return readFileSync(path.join(FIXTURES_DIR, name), "utf8");
}

function runFixtureSuite(): void {
  console.log("ParentSquare scraper verification (fixture mode)");
  console.log("=================================================");

  const listingHtml = readFixture("parentsquare-listing.html");

  console.log("\nPlatform detection");
  check("listing detected as ParentSquare", isParentSquarePolicyListingHtml(listingHtml));
  check(
    "listing NOT detected as table-link platform",
    !isTableLinkedPolicyListingHtml(listingHtml),
  );
  check(
    "listing NOT detected as accordion-pdf platform",
    !isAccordionPdfPolicyListingHtml(listingHtml),
  );
  check(
    "service accepts requested platform 'parentsquare'",
    normalizeRequestedPolicyPlatform("parentsquare") === "parentsquare",
  );
  check(
    "service label for parentsquare is 'ParentSquare'",
    formatPolicyPlatform("parentsquare") === "ParentSquare",
  );

  console.log("\nListing parse");
  const listing = parseParentSquarePolicyListing(listingHtml, LISTING_URL);
  check(
    "discovers 94 linked policies",
    listing.items.length === 94,
    `got ${listing.items.length}`,
  );
  check(
    "skips 3 unlinked placeholder rows (A285, C575, G475)",
    listing.skippedPlaceholderRows === 3,
    `got ${listing.skippedPlaceholderRows}`,
  );
  const first = listing.items[0];
  check(
    "first item is A100 with absolute detail URL",
    first?.listingCode === "A100" && first?.url === "https://wwayne.k12.in.us/68134_4",
    JSON.stringify(first),
  );
  const c100 = listing.items.find((item) => item.listingCode === "C100");
  check(
    "www-host links are accepted as same-site",
    c100?.url === "https://www.wwayne.k12.in.us/68838_4",
    JSON.stringify(c100),
  );
  const c350 = listing.items.find((item) => item.listingCode === "C350");
  check(
    "slugged listing titles are de-hyphenated for fallback",
    c350?.fallbackTitle === "Student Discipline",
    JSON.stringify(c350?.fallbackTitle),
  );
  const a300 = listing.items.find((item) => item.listingCode === "A300");
  check(
    "listing titles with spaces are preserved verbatim",
    a300?.fallbackTitle === "Responsible Use of Technology and Internet Safety",
    JSON.stringify(a300?.fallbackTitle),
  );

  console.log("\nDetail parse: separate code/title with table, list, bracketed dates (A100)");
  const a100 = parseParentSquarePolicyDetail(readFixture("parentsquare-detail-a100.html"), listingItem({
    url: "https://wwayne.k12.in.us/68134_4",
    listingCode: "A100",
    fallbackTitle: "NonDiscrimination & Anti-Harrassment 2025",
  }));
  check("code parsed from page body", a100.policyNumber === "A100");
  check(
    "title parsed from page body (not listing fallback)",
    a100.policyTitle === "NON-DISCRIMINATION & ANTI-HARASSMENT",
    a100.policyTitle,
  );
  check("series derived from code", a100.series === "A Policies", a100.series);
  check("no adopted date on this page", a100.adoptedDate === "");
  check(
    "both bracketed revision dates captured in order",
    a100.revisionHistory === "08/10/22; 08/13/25",
    a100.revisionHistory,
  );
  check(
    "wording starts at policy text",
    a100.policyWording.startsWith("The School Corporation does not discriminate"),
    a100.policyWording.slice(0, 60),
  );
  check(
    "wording includes table cell content",
    a100.policyWording.includes("Title IX Coordinator"),
  );
  check(
    "wording includes numbered list items",
    a100.policyWording.includes("Report the conduct to the building principal"),
  );
  check(
    "wording excludes breadcrumb navigation",
    !a100.policyWording.includes("Board of Education"),
  );
  check(
    "wording excludes trailing revision lines",
    !/Revised:/.test(a100.policyWording),
  );

  console.log("\nDetail parse: combined 'CODE - TITLE' heading (C350)");
  const c350Detail = parseParentSquarePolicyDetail(
    readFixture("parentsquare-detail-c350.html"),
    listingItem({
      url: "https://www.wwayne.k12.in.us/68847_4",
      listingCode: "C350",
      fallbackTitle: "Student Discipline",
    }),
  );
  check("code split from combined heading", c350Detail.policyNumber === "C350");
  check(
    "title split from combined heading",
    c350Detail.policyTitle === "STUDENT DISCIPLINE",
    c350Detail.policyTitle,
  );
  check("series derived from code", c350Detail.series === "C Policies");
  check(
    "colon-less 'Revised 8/14/19' captured",
    c350Detail.revisionHistory === "8/14/19",
    c350Detail.revisionHistory,
  );
  const c350Paragraphs = c350Detail.policyWording.split("\n\n");
  check(
    "all 10 wording paragraphs preserved",
    c350Paragraphs.length === 10,
    `got ${c350Paragraphs.length}`,
  );
  check(
    "wording begins with first policy paragraph",
    c350Detail.policyWording.startsWith("The School Board acknowledges"),
  );
  check(
    "wording ends with statutory citation",
    c350Detail.policyWording.endsWith("I.C. 20-33-8-1 et seq."),
    c350Detail.policyWording.slice(-40),
  );

  console.log("\nDetail parse: dotted date formats (F225)");
  const f225 = parseParentSquarePolicyDetail(readFixture("parentsquare-detail-f225.html"), listingItem({
    url: "https://www.wwayne.k12.in.us/68977_4",
    listingCode: "F225",
    fallbackTitle: "Fundraising & Crowdfunding",
  }));
  check("adopted date captured from 'Adopted: 2.14.24'", f225.adoptedDate === "2.14.24");
  check(
    "revision captured from 'Revised: 12.10.25'",
    f225.revisionHistory === "12.10.25",
    f225.revisionHistory,
  );
  check("title parsed", f225.policyTitle === "FUNDRAISING & CROWDFUNDING");

  console.log("\nCSV export");
  const csv = parentSquarePolicyRowsToCsv([a100, c350Detail, f225]);
  check("CSV starts with UTF-8 BOM", csv.startsWith("\uFEFF"));
  check(
    "CSV header row present",
    csv.includes(
      "Series,Policy Number,Policy Title,Adopted Date,Revision History,Policy Wording,Source URL",
    ),
  );
  check(
    "multi-paragraph wording is quoted",
    csv.includes('"The School Board acknowledges'),
  );
  check("source URLs included", csv.includes("https://wwayne.k12.in.us/68134_4"));

  console.log("\n-------------------------------------------------");
  if (failures > 0) {
    console.error(`${failures} check(s) FAILED.`);
    process.exit(1);
  }
  console.log("All fixture checks passed.");
}

async function runLiveSuite(sourceUrl: string): Promise<void> {
  console.log("ParentSquare scraper verification (LIVE mode, no database writes)");
  console.log("==================================================================");
  console.log(`Scraping: ${sourceUrl}`);

  const startedAt = Date.now();
  const result = await scrapeParentSquarePolicies({ sourceUrl, concurrency: 6 });
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log(`\nCompleted in ${seconds}s`);
  console.log(`  Listing URL:            ${result.listingUrl}`);
  console.log(`  Linked policies found:  ${result.discoveredPolicyLinks}`);
  console.log(`  Placeholder rows:       ${result.skippedPlaceholderRows}`);
  console.log(`  Policies parsed:        ${result.rows.length}`);
  console.log(`  Failed pages:           ${result.failedItems.length}`);

  for (const failed of result.failedItems) {
    console.log(`    FAILED ${failed.url} -> ${failed.reason}`);
  }

  const missingTitle = result.rows.filter((row) => !row.policyTitle).length;
  const missingCode = result.rows.filter((row) => !row.policyNumber).length;
  const thinWording = result.rows.filter((row) => row.policyWording.length < 200);
  console.log(`  Rows missing code:      ${missingCode}`);
  console.log(`  Rows missing title:     ${missingTitle}`);
  console.log(`  Rows with <200ch text:  ${thinWording.length}`);
  for (const row of thinWording.slice(0, 5)) {
    console.log(`    THIN ${row.policyNumber} (${row.policyWording.length}ch) ${row.sourceUrl}`);
  }

  console.log("\nSamples:");
  const samples = [
    result.rows[0],
    result.rows[Math.floor(result.rows.length / 2)],
    result.rows[result.rows.length - 1],
  ];
  for (const row of samples) {
    if (!row) {
      continue;
    }
    console.log(
      `  ${row.policyNumber} | ${row.series} | ${row.policyTitle.slice(0, 48)} | ` +
        `adopted "${row.adoptedDate}" | revised "${row.revisionHistory.slice(0, 40)}" | ` +
        `${row.policyWording.length} chars`,
    );
  }

  if (result.rows.length === 0 || result.failedItems.length > result.rows.length) {
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const liveIndex = args.indexOf("--live");

  if (liveIndex === -1) {
    runFixtureSuite();
    return;
  }

  const explicitUrl = args
    .filter((_value, index) => index !== liveIndex)
    .find((value) => !value.startsWith("--"));
  await runLiveSuite(explicitUrl ?? DEFAULT_LIVE_URL);
}

main().catch((error) => {
  console.error("Verification failed:", error);
  process.exit(1);
});

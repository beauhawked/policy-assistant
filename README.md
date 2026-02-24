# School District Policy Assistant

This Next.js app now supports two workflows:

1. `Policy Assistant` (primary flow)
- Upload a district policy `.csv` file
- Store policies in a Postgres database
- Sign in with an account (email/password) to keep each district dataset private
- Verify email before activating the workspace
- Reset password securely via email
- Ask scenario-based questions and receive policy-grounded guidance using OpenAI

2. `Policy Scraper` (existing flow)
- Scrape district policies from BoardDocs, table-based policy pages, or accordion pages with PDF policy links
- Export results as CSV for upload into the assistant

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Configure environment:

```bash
cp .env.example .env.local
```

Set at least:

- `OPENAI_API_KEY=<your-openai-api-key>`
- `POLICY_ASSISTANT_DATABASE_URL=<postgres-connection-string>`

Optional:

- `POLICY_ASSISTANT_MODEL=gpt-4.1-mini`
- `RESEND_API_KEY=<resend-api-key>` (required in production for verification/reset emails)
- `POLICY_ASSISTANT_FROM_EMAIL="Policy Assistant <noreply@yourdomain.com>"`

On Vercel with Vercel Postgres, `POSTGRES_URL` is provided automatically, so
`POLICY_ASSISTANT_DATABASE_URL` can be omitted.

3. Start development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The home route redirects to `/policy-assistant`.

## Account access

- Users create an account and sign in at `/policy-assistant`.
- New accounts must verify email before uploading datasets or chatting.
- Policy datasets are scoped to the signed-in account.
- Upload once, then sign in later to keep asking questions without re-uploading.
- Conversation history is saved per user and per dataset.
- Users can reopen prior conversations after signing back in.
- Password reset links are one-time and time-limited.

## Security controls

- Email verification tokens are single-use and expire after 24 hours.
- Password reset tokens are single-use and expire after 60 minutes.
- Basic rate limiting is enabled for auth endpoints, uploads, and chat calls.

## Policy Assistant CSV mapping

The upload parser auto-maps common headers, including:

- `Section` / `Policy Section` / `Policy Chapter`
- `Code` / `Policy Code` / `Policy Number`
- `Adopted Date`
- `Revised Date`
- `Status`
- `Policy Title`
- `Policy Wording`

Rows with empty policy text and title are ignored.

## Policy Scraper

Go to `/policies` for CSV scraping/export.

Supported platforms:

1. `BoardDocs`
2. `Table-based policy pages` (Sarasota-style index table with policy detail pages)
3. `Accordion + PDF policy pages` (Pequot-style series accordion with linked PDF files)

BoardDocs export columns:

1. `Section`
2. `Code`
3. `Adopted Date`
4. `Revised Date`
5. `Status`
6. `Policy Title`
7. `Policy Wording`

Table-based export columns:

1. `Policy Chapter`
2. `Policy Number`
3. `Policy Title`
4. `Policy Wording`
5. `Statutory Authority`
6. `Law(s) Implemented`
7. `History`
8. `Notes`

Accordion + PDF export columns:

1. `Board Policy Number`
2. `Title`
3. `Series`
4. `Adopted Date`
5. `Revision History`
6. `Policy Wording`
7. `Legal References`
8. `Cross References`

Example URLs:

- BoardDocs: `https://go.boarddocs.com/in/blm/Board.nsf/Public`
- Table-based: `https://www.sarasotacountyschools.net/page/school-board-policies`
- Accordion + PDF: `https://www.isd186.org/district-home-page/district-policies`

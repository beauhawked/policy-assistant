# School District Policy Assistant

This Next.js app now supports two workflows:

1. `Policy Assistant` (primary flow)
- Upload a district policy `.csv` file
- Store policies in a Postgres database
- Ask scenario-based questions and receive policy-grounded guidance using OpenAI

2. `Policy Scraper` (existing flow)
- Scrape district policies from BoardDocs or table-based policy pages
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

On Vercel with Vercel Postgres, `POSTGRES_URL` is provided automatically, so
`POLICY_ASSISTANT_DATABASE_URL` can be omitted.

3. Start development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The home route redirects to `/policy-assistant`.

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

Example URLs:

- BoardDocs: `https://go.boarddocs.com/in/blm/Board.nsf/Public`
- Table-based: `https://www.sarasotacountyschools.net/page/school-board-policies`

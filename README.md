# BoardDocs Policy Scraper

Next.js app that scrapes school district policies from BoardDocs URLs and exports CSV files in this exact format:

1. `Section`
2. `Code`
3. `Adopted Date`
4. `Revised Date`
5. `Status`
6. `Policy Title`
7. `Policy Wording`

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), paste a district BoardDocs URL, and click **Scrape Policies and Download CSV**.

## Supported URL pattern

Any BoardDocs district URL that includes `/Board.nsf`, for example:

- `https://go.boarddocs.com/in/blm/Board.nsf/Public`
- `https://go.boarddocs.com/mi/aaps/Board.nsf/Public`

## Notes

- The scraper uses BoardDocs endpoints:
  - `BD-GetPolicyBooks`
  - `BD-GetPolicies`
  - `BD-GetPolicyItem`
- By default, the app targets policy/bylaw books only. You can enable **Include all books** in the UI to capture everything.

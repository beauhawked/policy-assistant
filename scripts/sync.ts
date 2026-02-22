import { syncBills } from "../src/lib/sync";

function parseArgs(argv: string[]): { year: string; limit?: number; concurrency?: number; billNames?: string[] } {
  const args = {
    year: "2026",
    limit: undefined as number | undefined,
    concurrency: 4,
    billNames: undefined as string[] | undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--year") {
      args.year = argv[index + 1] ?? args.year;
      index += 1;
      continue;
    }

    if (token === "--limit") {
      const parsed = Number(argv[index + 1]);
      if (!Number.isNaN(parsed) && parsed > 0) {
        args.limit = parsed;
      }
      index += 1;
      continue;
    }

    if (token === "--concurrency") {
      const parsed = Number(argv[index + 1]);
      if (!Number.isNaN(parsed) && parsed > 0) {
        args.concurrency = parsed;
      }
      index += 1;
      continue;
    }

    if (token === "--bills") {
      const list = (argv[index + 1] ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => value.toUpperCase());

      if (list.length > 0) {
        args.billNames = list;
      }

      index += 1;
      continue;
    }
  }

  return args;
}

async function run(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const result = await syncBills(options);

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown sync error";
  process.stderr.write(`Sync failed: ${message}\n`);
  process.exit(1);
});

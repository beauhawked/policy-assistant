import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Minimal .env.local loader for command-line scripts.
 * Next.js loads .env.local automatically for the app; plain tsx scripts do
 * not, so this replicates just enough of that behavior. Values already set in
 * the shell environment win over file values.
 */
export function loadLocalEnv(): void {
  const candidates = [".env.local", ".env"];

  for (const filename of candidates) {
    let content: string;
    try {
      content = readFileSync(resolve(process.cwd(), filename), "utf8");
    } catch {
      continue;
    }

    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }

      const equalsIndex = line.indexOf("=");
      if (equalsIndex <= 0) {
        continue;
      }

      const key = line.slice(0, equalsIndex).trim();
      let value = line.slice(equalsIndex + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }
}

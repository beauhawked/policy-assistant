import { loadLocalEnv } from "./load-local-env";

loadLocalEnv();

async function main(): Promise<void> {
  // Imported after env load so the db module sees the credentials.
  const { setUserAccountRoleByEmail } = await import("../src/lib/policy-assistant/db");

  const email = (process.argv[2] ?? "beau.scott@me.com").trim().toLowerCase();

  console.log("Policy Aligned — grant admin role");
  console.log("===================================");
  console.log(`Granting the admin role to: ${email}`);
  console.log("(Connecting to the database also applies any pending schema updates.)");

  const user = await setUserAccountRoleByEmail(email, "admin");

  if (!user) {
    console.error(`No account was found for ${email}. Check the spelling and try again.`);
    process.exit(1);
  }

  console.log(`Done. ${user.email} is now a platform admin.`);
  console.log("Sign in to the app and visit /admin to open the panel.");
  process.exit(0);
}

main().catch((error) => {
  console.error("Grant admin failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});

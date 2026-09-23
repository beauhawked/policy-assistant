import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserFromRequest } from "@/lib/policy-assistant/auth";
import type { AuthUser } from "@/lib/policy-assistant/types";

export type AdminGuardResult =
  | { ok: true; user: AuthUser }
  | { ok: false; response: NextResponse };

export async function requireAdminUser(request: NextRequest): Promise<AdminGuardResult> {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "You must be signed in." }, { status: 401 }),
    };
  }

  if (user.accountRole !== "admin") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "You are not authorized to access the admin panel." },
        { status: 403 },
      ),
    };
  }

  return { ok: true, user };
}

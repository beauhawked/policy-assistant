import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserFromRequest } from "@/lib/policy-assistant/auth";
import { updateUserName } from "@/lib/policy-assistant/db";
import { rateLimitExceededResponse, serverErrorResponse } from "@/lib/policy-assistant/http";
import { buildRateLimitIdentifier, checkRateLimit } from "@/lib/policy-assistant/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface UpdateProfilePayload {
  firstName?: unknown;
  lastName?: unknown;
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getAuthenticatedUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }

    const rateLimit = await checkRateLimit({
      scope: "auth_profile_update",
      identifier: buildRateLimitIdentifier(request, { userId: user.id, email: user.email }),
      maxRequests: 10,
      windowSeconds: 60,
    });
    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(
        rateLimit.retryAfterSeconds,
        "Too many profile updates. Please wait and try again.",
      );
    }

    const payload = (await request.json().catch(() => ({}))) as UpdateProfilePayload;
    const firstName =
      typeof payload.firstName === "string" ? payload.firstName.trim().slice(0, 80) : "";
    const lastName =
      typeof payload.lastName === "string" ? payload.lastName.trim().slice(0, 80) : "";

    if (!firstName) {
      return NextResponse.json({ error: "First name is required." }, { status: 400 });
    }

    const updated = await updateUserName(user.id, firstName, lastName);
    if (!updated) {
      return NextResponse.json({ error: "Could not update your profile." }, { status: 404 });
    }

    return NextResponse.json({ user: updated }, { status: 200 });
  } catch (error) {
    return serverErrorResponse(error, "Could not update your profile.", "auth_profile_update");
  }
}

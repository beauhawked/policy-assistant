import { NextRequest, NextResponse } from "next/server";

import {
  clearSessionCookie,
  getAuthenticatedUserFromRequest,
  verifyPassword,
} from "@/lib/policy-assistant/auth";
import { deleteUserAccount, getUserPasswordHash } from "@/lib/policy-assistant/db";
import { rateLimitExceededResponse, serverErrorResponse } from "@/lib/policy-assistant/http";
import { buildRateLimitIdentifier, checkRateLimit } from "@/lib/policy-assistant/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DeleteAccountPayload {
  password?: unknown;
  confirmation?: unknown;
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getAuthenticatedUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }

    const rateLimit = await checkRateLimit({
      scope: "account_delete",
      identifier: buildRateLimitIdentifier(request, { userId: user.id, email: user.email }),
      maxRequests: 3,
      windowSeconds: 10 * 60,
    });
    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(
        rateLimit.retryAfterSeconds,
        "Too many attempts. Please wait and try again.",
      );
    }

    const payload = (await request.json().catch(() => ({}))) as DeleteAccountPayload;
    const password = typeof payload.password === "string" ? payload.password : "";
    const confirmation = typeof payload.confirmation === "string" ? payload.confirmation.trim() : "";

    if (confirmation !== "DELETE") {
      return NextResponse.json(
        { error: 'Type DELETE in the confirmation field to proceed.' },
        { status: 400 },
      );
    }

    const storedHash = await getUserPasswordHash(user.id);
    if (!storedHash || !password || !(await verifyPassword(password, storedHash))) {
      return NextResponse.json({ error: "Your password is incorrect." }, { status: 403 });
    }

    await deleteUserAccount(user.id);

    const response = NextResponse.json(
      { deleted: true, message: "Your account and all of its data have been deleted." },
      { status: 200 },
    );
    clearSessionCookie(response);
    return response;
  } catch (error) {
    return serverErrorResponse(error, "Could not delete your account.", "account_delete");
  }
}

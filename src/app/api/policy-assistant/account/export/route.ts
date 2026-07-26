import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserFromRequest, isUserEmailVerified } from "@/lib/policy-assistant/auth";
import { exportUserData } from "@/lib/policy-assistant/db";
import { rateLimitExceededResponse, serverErrorResponse } from "@/lib/policy-assistant/http";
import { buildRateLimitIdentifier, checkRateLimit } from "@/lib/policy-assistant/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getAuthenticatedUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }
    if (!isUserEmailVerified(user)) {
      return NextResponse.json(
        { error: "Please verify your email before exporting data." },
        { status: 403 },
      );
    }

    const rateLimit = await checkRateLimit({
      scope: "account_export",
      identifier: buildRateLimitIdentifier(request, { userId: user.id, email: user.email }),
      maxRequests: 5,
      windowSeconds: 10 * 60,
    });
    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(
        rateLimit.retryAfterSeconds,
        "Too many export requests. Please wait and try again.",
      );
    }

    const data = await exportUserData(user.id);
    const payload = {
      exportedAt: new Date().toISOString(),
      account: {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        districtName: user.districtName,
        roleTitle: user.roleTitle,
        profileContext: user.profileContext,
        createdAt: user.createdAt,
      },
      conversations: data.conversations,
      pinnedAnswers: data.pinnedAnswers,
    };

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "content-disposition": 'attachment; filename="policy-to-action-export.json"',
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return serverErrorResponse(error, "Could not export your data.", "account_export");
  }
}

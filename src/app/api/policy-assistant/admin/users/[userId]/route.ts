import { NextRequest, NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/policy-assistant/admin";
import { getRequestIpAddress, verifyPassword } from "@/lib/policy-assistant/auth";
import {
  deleteUserAccount,
  findUserById,
  getUserPasswordHash,
  recordAuditEvent,
  setUserAccountDeactivated,
  setUserEmailVerified,
} from "@/lib/policy-assistant/db";
import { rateLimitExceededResponse, serverErrorResponse } from "@/lib/policy-assistant/http";
import { buildRateLimitIdentifier, checkRateLimit } from "@/lib/policy-assistant/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{
    userId: string;
  }>;
}

interface AdminUserPatchPayload {
  action?: unknown;
}

interface AdminUserDeletePayload {
  password?: unknown;
  confirmation?: unknown;
}

const PATCH_ACTIONS = new Set(["deactivate", "reactivate", "verify-email"]);

export async function PATCH(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const guard = await requireAdminUser(request);
    if (!guard.ok) {
      return guard.response;
    }
    const admin = guard.user;

    const rateLimit = await checkRateLimit({
      scope: "admin_user_update",
      identifier: buildRateLimitIdentifier(request, { userId: admin.id, email: admin.email }),
      maxRequests: 30,
      windowSeconds: 10 * 60,
    });
    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(rateLimit.retryAfterSeconds);
    }

    const { userId } = await context.params;
    const payload = (await request.json().catch(() => ({}))) as AdminUserPatchPayload;
    const action = typeof payload.action === "string" ? payload.action : "";

    if (!PATCH_ACTIONS.has(action)) {
      return NextResponse.json({ error: "Unknown admin action." }, { status: 400 });
    }

    const target = await findUserById(userId);
    if (!target) {
      return NextResponse.json({ error: "That user no longer exists." }, { status: 404 });
    }

    if (target.id === admin.id && action !== "verify-email") {
      return NextResponse.json(
        { error: "You cannot deactivate your own admin account from the panel." },
        { status: 400 },
      );
    }

    if (target.accountRole === "admin" && action === "deactivate") {
      return NextResponse.json(
        { error: "Admin accounts cannot be deactivated from the panel." },
        { status: 400 },
      );
    }

    let updated = target;
    if (action === "deactivate" || action === "reactivate") {
      const result = await setUserAccountDeactivated(target.id, action === "deactivate");
      if (!result) {
        return NextResponse.json({ error: "That user no longer exists." }, { status: 404 });
      }
      updated = result;
    } else if (action === "verify-email") {
      const result = await setUserEmailVerified(target.id);
      if (!result) {
        return NextResponse.json({ error: "That user no longer exists." }, { status: 404 });
      }
      updated = result;
    }

    await recordAuditEvent({
      actorUserId: admin.id,
      actorEmail: admin.email,
      action: `admin.user.${action}`,
      targetUserId: target.id,
      targetEmail: target.email,
      ipAddress: getRequestIpAddress(request),
    });

    return NextResponse.json({ user: updated }, { status: 200 });
  } catch (error) {
    return serverErrorResponse(error, "Could not update that user.", "admin_user_update");
  }
}

export async function DELETE(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const guard = await requireAdminUser(request);
    if (!guard.ok) {
      return guard.response;
    }
    const admin = guard.user;

    const rateLimit = await checkRateLimit({
      scope: "admin_user_delete",
      identifier: buildRateLimitIdentifier(request, { userId: admin.id, email: admin.email }),
      maxRequests: 5,
      windowSeconds: 10 * 60,
    });
    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(
        rateLimit.retryAfterSeconds,
        "Too many deletion attempts. Please wait and try again.",
      );
    }

    const { userId } = await context.params;
    const payload = (await request.json().catch(() => ({}))) as AdminUserDeletePayload;
    const password = typeof payload.password === "string" ? payload.password : "";
    const confirmation = typeof payload.confirmation === "string" ? payload.confirmation.trim() : "";

    if (confirmation !== "DELETE") {
      return NextResponse.json(
        { error: 'Type DELETE in the confirmation field to proceed.' },
        { status: 400 },
      );
    }

    const storedHash = await getUserPasswordHash(admin.id);
    if (!storedHash || !password || !(await verifyPassword(password, storedHash))) {
      return NextResponse.json({ error: "Your admin password is incorrect." }, { status: 403 });
    }

    const target = await findUserById(userId);
    if (!target) {
      return NextResponse.json({ error: "That user no longer exists." }, { status: 404 });
    }

    if (target.id === admin.id) {
      return NextResponse.json(
        { error: "You cannot delete your own account from the admin panel. Use account settings instead." },
        { status: 400 },
      );
    }

    if (target.accountRole === "admin") {
      return NextResponse.json(
        { error: "Admin accounts cannot be deleted from the panel." },
        { status: 400 },
      );
    }

    await deleteUserAccount(target.id);

    await recordAuditEvent({
      actorUserId: admin.id,
      actorEmail: admin.email,
      action: "admin.user.delete",
      targetUserId: target.id,
      targetEmail: target.email,
      details: {
        districtName: target.districtName,
        createdAt: target.createdAt,
      },
      ipAddress: getRequestIpAddress(request),
    });

    return NextResponse.json(
      { deleted: true, message: "The account and all of its data have been deleted." },
      { status: 200 },
    );
  } catch (error) {
    return serverErrorResponse(error, "Could not delete that user.", "admin_user_delete");
  }
}

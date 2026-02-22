import { NextRequest, NextResponse } from "next/server";

import { setSessionCookie, verifyPassword } from "@/lib/policy-assistant/auth";
import { createAuthSession, findUserByEmail } from "@/lib/policy-assistant/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface LoginPayload {
  email?: string;
  password?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = (await request.json().catch(() => ({}))) as LoginPayload;
    const email = normalizeEmail(payload.email);
    const password = payload.password?.trim() ?? "";

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    const existing = await findUserByEmail(email);
    if (!existing) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    const isValidPassword = await verifyPassword(password, existing.passwordHash);
    if (!isValidPassword) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    const session = await createAuthSession(existing.user.id);
    const response = NextResponse.json({ user: existing.user }, { status: 200 });
    setSessionCookie(response, session.id, session.expiresAt);
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Login failed." },
      { status: 500 },
    );
  }
}

function normalizeEmail(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

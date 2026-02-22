import { NextRequest, NextResponse } from "next/server";

import { hashPassword, setSessionCookie } from "@/lib/policy-assistant/auth";
import { createAuthSession, createUserAccount, findUserByEmail } from "@/lib/policy-assistant/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SignupPayload {
  email?: string;
  password?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = (await request.json().catch(() => ({}))) as SignupPayload;
    const email = normalizeEmail(payload.email);
    const password = payload.password?.trim() ?? "";

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const existing = await findUserByEmail(email);
    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const user = await createUserAccount(email, passwordHash);
    const session = await createAuthSession(user.id);

    const response = NextResponse.json({ user }, { status: 201 });
    setSessionCookie(response, session.id, session.expiresAt);
    return response;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Signup failed." },
      { status: 500 },
    );
  }
}

function normalizeEmail(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

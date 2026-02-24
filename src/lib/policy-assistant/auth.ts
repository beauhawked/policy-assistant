import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

import type { NextRequest, NextResponse } from "next/server";

import { getUserBySessionId } from "@/lib/policy-assistant/db";
import type { AuthUser } from "@/lib/policy-assistant/types";

const scrypt = promisify(scryptCallback);

export const SESSION_COOKIE_NAME = "policy_session";
const SCRYPT_KEY_LENGTH = 64;
const MIN_PASSWORD_LENGTH = 10;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, SCRYPT_KEY_LENGTH)) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, keyHex] = storedHash.split(":");
  if (!salt || !keyHex) {
    return false;
  }

  const derivedKey = (await scrypt(password, salt, SCRYPT_KEY_LENGTH)) as Buffer;
  const storedKey = Buffer.from(keyHex, "hex");
  if (storedKey.length !== derivedKey.length) {
    return false;
  }

  return timingSafeEqual(storedKey, derivedKey);
}

export function createOneTimeToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashOneTimeToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function getAuthenticatedUserFromRequest(request: NextRequest): Promise<AuthUser | null> {
  const sessionId = request.cookies.get(SESSION_COOKIE_NAME)?.value?.trim();
  if (!sessionId) {
    return null;
  }

  return getUserBySessionId(sessionId);
}

export function isUserEmailVerified(user: AuthUser): boolean {
  return Boolean(user.emailVerifiedAt);
}

export function setSessionCookie(response: NextResponse, sessionId: string, expiresAt: string): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: sessionId,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export function normalizeEmail(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function validatePasswordPolicy(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

export function getRequestIpAddress(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function getRequestOrigin(request: NextRequest): string {
  const configuredOrigin = resolveConfiguredAppOrigin();
  if (configuredOrigin) {
    return configuredOrigin;
  }

  if (process.env.NODE_ENV !== "production") {
    return new URL(request.url).origin;
  }

  throw new Error(
    "POLICY_ASSISTANT_APP_ORIGIN is required in production for secure verification and reset links.",
  );
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

function resolveConfiguredAppOrigin(): string | null {
  const directOrigin =
    process.env.POLICY_ASSISTANT_APP_ORIGIN?.trim() ||
    process.env.APP_ORIGIN?.trim() ||
    process.env.NEXT_PUBLIC_APP_ORIGIN?.trim();

  if (directOrigin) {
    return normalizeConfiguredOrigin(directOrigin);
  }

  const vercelOrigin =
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || process.env.VERCEL_URL?.trim();
  if (vercelOrigin) {
    return normalizeConfiguredOrigin(vercelOrigin.startsWith("http") ? vercelOrigin : `https://${vercelOrigin}`);
  }

  return null;
}

function normalizeConfiguredOrigin(rawOrigin: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawOrigin);
  } catch {
    throw new Error(`Invalid app origin configuration: ${rawOrigin}`);
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`App origin must use http or https: ${rawOrigin}`);
  }

  return parsed.origin;
}

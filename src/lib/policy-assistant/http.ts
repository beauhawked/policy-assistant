import { NextResponse } from "next/server";

export function rateLimitExceededResponse(
  retryAfterSeconds: number,
  message = "Too many requests. Please try again shortly.",
): NextResponse {
  const response = NextResponse.json({ error: message }, { status: 429 });
  response.headers.set("Retry-After", String(Math.max(1, Math.floor(retryAfterSeconds))));
  return response;
}

export function buildUrlWithPath(origin: string, path: string, params?: Record<string, string>): string {
  const url = new URL(path, origin);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

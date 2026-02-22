import type { NextRequest } from "next/server";

import { getRequestIpAddress } from "@/lib/policy-assistant/auth";
import {
  cleanupExpiredRateLimitBuckets,
  incrementRateLimitBucket,
} from "@/lib/policy-assistant/db";

interface RateLimitInput {
  scope: string;
  identifier: string;
  maxRequests: number;
  windowSeconds: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

interface RequestRateLimitIdentifierOptions {
  email?: string;
  userId?: string;
}

export async function checkRateLimit(input: RateLimitInput): Promise<RateLimitResult> {
  const windowSeconds = Math.max(1, Math.floor(input.windowSeconds));
  const maxRequests = Math.max(1, Math.floor(input.maxRequests));

  const nowMs = Date.now();
  const windowMs = windowSeconds * 1000;
  const bucketStartMs = Math.floor(nowMs / windowMs) * windowMs;
  const bucketStart = new Date(bucketStartMs).toISOString();

  const count = await incrementRateLimitBucket(input.scope, input.identifier, bucketStart);
  if (Math.random() < 0.03) {
    await cleanupExpiredRateLimitBuckets();
  }

  const retryAfterSeconds = Math.max(1, Math.ceil((bucketStartMs + windowMs - nowMs) / 1000));
  const remaining = Math.max(0, maxRequests - count);

  return {
    allowed: count <= maxRequests,
    remaining,
    retryAfterSeconds,
  };
}

export function buildRateLimitIdentifier(
  request: NextRequest,
  options?: RequestRateLimitIdentifierOptions,
): string {
  const ip = getRequestIpAddress(request);
  const userId = options?.userId?.trim();
  const email = options?.email?.trim().toLowerCase();

  if (userId && email) {
    return `ip:${ip}|user:${userId}|email:${email}`;
  }

  if (userId) {
    return `ip:${ip}|user:${userId}`;
  }

  if (email) {
    return `ip:${ip}|email:${email}`;
  }

  return `ip:${ip}`;
}

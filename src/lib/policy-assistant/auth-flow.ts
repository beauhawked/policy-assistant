import {
  consumeEmailVerificationTokenByHash,
  consumePasswordResetTokenByHash,
  createEmailVerificationTokenRecord,
  createPasswordResetTokenRecord,
  createAuthSession,
  findUserById,
  setUserEmailVerified,
} from "@/lib/policy-assistant/db";
import {
  createOneTimeToken,
  hashOneTimeToken,
} from "@/lib/policy-assistant/auth";
import { sendPasswordResetEmail, sendVerificationEmail } from "@/lib/policy-assistant/email";
import { buildUrlWithPath } from "@/lib/policy-assistant/http";
import type { AuthUser } from "@/lib/policy-assistant/types";

export async function issueEmailVerificationForUser(user: AuthUser, origin: string): Promise<void> {
  const token = createOneTimeToken();
  const tokenHash = hashOneTimeToken(token);
  await createEmailVerificationTokenRecord(user.id, tokenHash, 24);

  const verificationLink = buildUrlWithPath(origin, "/policy-assistant", {
    verifyToken: token,
  });

  await sendVerificationEmail({
    to: user.email,
    verificationLink,
  });
}

export async function issuePasswordResetForUser(user: AuthUser, origin: string): Promise<void> {
  const token = createOneTimeToken();
  const tokenHash = hashOneTimeToken(token);
  await createPasswordResetTokenRecord(user.id, tokenHash, 60);

  const resetLink = buildUrlWithPath(origin, "/policy-assistant", {
    resetToken: token,
  });

  await sendPasswordResetEmail({
    to: user.email,
    resetLink,
  });
}

export async function verifyEmailToken(token: string): Promise<AuthUser | null> {
  const tokenHash = hashOneTimeToken(token);
  const userId = await consumeEmailVerificationTokenByHash(tokenHash);
  if (!userId) {
    return null;
  }

  return setUserEmailVerified(userId);
}

export async function consumePasswordResetToken(token: string): Promise<AuthUser | null> {
  const tokenHash = hashOneTimeToken(token);
  const userId = await consumePasswordResetTokenByHash(tokenHash);
  if (!userId) {
    return null;
  }

  return findUserById(userId);
}

export async function createSessionForVerifiedUser(user: AuthUser): Promise<{
  sessionId: string;
  expiresAt: string;
}> {
  const session = await createAuthSession(user.id);
  return {
    sessionId: session.id,
    expiresAt: session.expiresAt,
  };
}

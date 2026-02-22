interface SendPolicyEmailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
}

interface VerificationEmailInput {
  to: string;
  verificationLink: string;
}

interface PasswordResetEmailInput {
  to: string;
  resetLink: string;
}

export async function sendVerificationEmail(input: VerificationEmailInput): Promise<void> {
  await sendPolicyAssistantEmail({
    to: input.to,
    subject: "Verify your School District Policy Assistant account",
    text: [
      "Welcome to School District Policy Assistant.",
      "",
      "Please verify your email address by opening this link:",
      input.verificationLink,
      "",
      "If you did not create this account, you can ignore this message.",
    ].join("\n"),
    html: [
      "<p>Welcome to School District Policy Assistant.</p>",
      `<p>Please verify your email address by selecting <a href="${escapeHtml(
        input.verificationLink,
      )}">Verify Email</a>.</p>`,
      `<p>If the button does not work, copy and paste this link into your browser:<br>${escapeHtml(
        input.verificationLink,
      )}</p>`,
      "<p>If you did not create this account, you can ignore this message.</p>",
    ].join(""),
  });
}

export async function sendPasswordResetEmail(input: PasswordResetEmailInput): Promise<void> {
  await sendPolicyAssistantEmail({
    to: input.to,
    subject: "Reset your School District Policy Assistant password",
    text: [
      "A password reset request was received for your School District Policy Assistant account.",
      "",
      "Open this link to reset your password:",
      input.resetLink,
      "",
      "If you did not request this, you can ignore this message.",
    ].join("\n"),
    html: [
      "<p>A password reset request was received for your School District Policy Assistant account.</p>",
      `<p>Select <a href="${escapeHtml(input.resetLink)}">Reset Password</a> to continue.</p>`,
      `<p>If the button does not work, copy and paste this link into your browser:<br>${escapeHtml(
        input.resetLink,
      )}</p>`,
      "<p>If you did not request this, you can ignore this message.</p>",
    ].join(""),
  });
}

export async function sendPolicyAssistantEmail(input: SendPolicyEmailInput): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const fromAddress =
    process.env.POLICY_ASSISTANT_FROM_EMAIL?.trim() || "Policy Assistant <onboarding@resend.dev>";

  if (!resendApiKey) {
    const fallbackMessage = [
      "RESEND_API_KEY is not configured.",
      `To: ${input.to}`,
      `Subject: ${input.subject}`,
      input.text,
    ].join("\n");

    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Email delivery is not configured. Set RESEND_API_KEY and POLICY_ASSISTANT_FROM_EMAIL in environment variables.",
      );
    }

    // Development fallback so verification/reset flows can still be tested locally.
    console.warn(fallbackMessage);
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
  });

  if (!response.ok) {
    const responseBody = await response.text().catch(() => "");
    throw new Error(
      `Email delivery failed with status ${response.status}${responseBody ? `: ${responseBody}` : ""}`,
    );
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const contentSecurityPolicy = [
  "default-src 'self'",
  // Next.js requires inline scripts for hydration; no external script hosts are allowed.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const policyAssistantSecurityHeaders = [
  { key: "Cache-Control", value: "no-store" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  // CSP only in production: the development server needs eval for fast refresh.
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Content-Security-Policy", value: contentSecurityPolicy }]
    : []),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  outputFileTracingRoot: __dirname,
  async headers() {
    return [
      {
        source: "/api/policy-assistant/:path*",
        headers: policyAssistantSecurityHeaders,
      },
      {
        source: "/policy-assistant",
        headers: policyAssistantSecurityHeaders,
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/bills/:billName",
        destination: "/bill?name=:billName",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;

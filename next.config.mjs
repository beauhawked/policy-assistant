import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const policyAssistantSecurityHeaders = [
  { key: "Cache-Control", value: "no-store" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
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

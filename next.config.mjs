import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  outputFileTracingRoot: __dirname,
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

import type { NextConfig } from "next";
import { contentSecurityPolicy } from "./src/lib/csp";

const allowPreviewIframe =
  process.env.ALLOW_PREVIEW_IFRAME === "1" || Boolean(process.env.APP_URL);

const baseSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  ...(allowPreviewIframe ? [] : [{ key: "X-Frame-Options", value: "DENY" }]),
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

// The policy without a nonce: no inline script at all. It is what static
// files, the tab icon, the upload route and API answers get. For a page,
// src/proxy.ts replaces it with one that carries that response's nonce.
// `/api/auth/google/callback` sets its own per-response nonced CSP so its
// popup script executes cleanly without `next.config.ts` overwriting it.
const cspHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy() },
];

const nextConfig: NextConfig = {
  // Note: output: "standalone" is intentionally NOT set. Next.js 16's Turbopack
  // bundler silently ignores it (no .next/standalone/ is produced), and we run
  // the panel via `next start` from the app root instead. Re-enable only if/when
  // the build switches back to --webpack.
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["better-sqlite3", "@node-rs/argon2"],
  ...(allowPreviewIframe
    ? {
        experimental: {
          serverActions: {
            allowedOrigins: ["*.run.app", "localhost:3000", "127.0.0.1:3000"],
          },
        },
      }
    : {}),
  async headers() {
    return [
      { source: "/:path*", headers: baseSecurityHeaders },
      { source: "/((?!api/auth/google/callback$).*)", headers: cspHeaders },
    ];
  },
};

export default nextConfig;

import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  output: "standalone",
  // Releases have their own lockfile/dependencies inside .deploy/releases/.
  outputFileTracingRoot: __dirname,
  poweredByHeader: false,
  devIndicators: false,
  turbopack: {
    root: __dirname,
    rules: {
      "*.css": {
        // Preserve Next.js's native scoped class exports for CSS Modules.
        condition: { not: { path: /\.module\.css$/ } },
        loaders: ["@tailwindcss/turbopack"],
        // Classify loader output directly; keep its original file identity.
        type: "css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
      ...["/verify-email", "/reset-password", "/forgot-password", "/join", "/family"].map((source) => ({ source, headers: [
        { key: "Referrer-Policy", value: "no-referrer" }, { key: "Cache-Control", value: "private, no-store" },
      ] })),
    ];
  },
};
export default nextConfig;

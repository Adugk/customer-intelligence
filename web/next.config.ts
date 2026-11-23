import type { NextConfig } from "next";

// Cache Components is deliberately off: every screen in this app shows
// live, per-user database data, so classic dynamic rendering is simpler.
const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  // Lets a phone open the dev server via this computer's network address.
  // Set DEV_ORIGINS in web/.env.local, e.g. DEV_ORIGINS=192.168.1.10,100.64.0.5
  allowedDevOrigins: (process.env.DEV_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

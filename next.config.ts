import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Disabled: the entire app is behind auth and inherently per-user/dynamic
  // (cookies-based session on every route), so static/cached prerendering
  // buys nothing here and forces artificial Suspense boundaries.
  cacheComponents: false,
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

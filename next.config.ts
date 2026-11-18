import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withSentryConfig(nextConfig, {
  org: "finsoft-co",
  project: "supabase-nextjs-lab",

  // Uploads a wider set of source maps for readable production stack traces.
  widenClientFileUpload: true,

  // Auth token comes from SENTRY_AUTH_TOKEN at build time; never committed.
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Only print source map upload logs in CI.
  silent: !process.env.CI,
});

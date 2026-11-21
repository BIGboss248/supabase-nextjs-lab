import type { Config } from "jest";
import nextJest from "next/jest.js";

/**
 * Jest through `next/jest`, the single runner this repo allows (#9 Decide the
 * test strategy and quality gates). `next/jest` supplies the SWC transform,
 * CSS and image mocks, and loads `.env.local` into `process.env`, which is how
 * the Supabase contract half sees the local stack's URL and publishable key.
 *
 * The environment is `node`: everything tested in Phase 3 is a module, not a
 * component. Component tests get their own environment when they land.
 */
const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  testEnvironment: "node",
  setupFiles: ["<rootDir>/tests/setup/Env.ts"],
  moduleNameMapper: {
    // Mirrors the `@/*` path alias in tsconfig.json.
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
  testPathIgnorePatterns: ["/node_modules/", "/.next/"],
};

export default createJestConfig(config);

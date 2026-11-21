import { config } from "dotenv";

/**
 * `next/jest` loads `.env`, `.env.test` and `.env.test.local`, and skips
 * `.env.local` whenever `NODE_ENV === "test"` — which Jest always sets. The
 * contract-real half needs the local stack's URL and publishable key, so this
 * loads the file Next would use at runtime, after the environment so a real CI
 * variable still wins.
 */
config({ path: ".env.local", quiet: true });

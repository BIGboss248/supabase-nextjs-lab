import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import checkFile from "eslint-plugin-check-file";

// Names Next reads as strings, plus the two files the framework or a library
// looks up by path. ADR 0001 keeps these lowercase on purpose.
const FRAMEWORK_FILES = [
  "src/app/**/{page,layout,template,loading,error,not-found,route,proxy,global-error}.{ts,tsx}",
  "src/{instrumentation,instrumentation-client,proxy}.ts",
  "src/sentry.*.config.ts",
  "src/adapters/supabase/index.ts",
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // ADR 0001: PascalCase files under src/, lowercase single-word directories.
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "check-file": checkFile },
    rules: {
      "check-file/filename-naming-convention": [
        "error",
        { "**/*.{ts,tsx}": "PASCAL_CASE" },
        // Skip the dotted role suffix, so ProductCard.client.tsx checks
        // "ProductCard" and not "ProductCard.client".
        { ignoreMiddleExtensions: true },
      ],
      "check-file/folder-naming-convention": [
        "error",
        {
          // Route segments may be [slug], [...rest] or (group); everything
          // else under src/ is a plain lowercase word.
          "src/app/**/*/": "NEXT_JS_APP_ROUTER_CASE",
          "src/!(app)/**/*/": "CAMEL_CASE",
          "src/!(app)/*/": "CAMEL_CASE",
        },
      ],
    },
  },
  {
    files: FRAMEWORK_FILES,
    rules: { "check-file/filename-naming-convention": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;

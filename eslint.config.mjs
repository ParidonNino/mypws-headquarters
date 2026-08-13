import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next. Note "build/**" is deliberately
    // absent: in this project build/ holds real source (sites-vite-plugin.ts),
    // and inheriting that default silently left it unlinted.
    ".next/**",
    "out/**",
    "dist/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;

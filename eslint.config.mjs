import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // The `mc` CLI emits dynamic, loosely-typed JSON. Allow `any` at this
    // external-CLI boundary (the mc driver and its typed admin wrappers)
    // rather than threading casts through every field access.
    files: ["lib/mc.ts", "lib/admin/**/*.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
]);

export default eslintConfig;

import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

// Flat-config bridge for ESLint 9 + eslint-config-next (Next 15). Without this,
// `next lint` drops into an interactive setup prompt and exits non-zero in CI.
const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Pure-stylistic — extremely noisy on existing JSX copy, no correctness value.
      "react/no-unescaped-entities": "off",
      // Real signals, but keep them advisory so they don't read as build-breaking errors.
      "@next/next/no-img-element": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "coverage/**",
      "out/**",
      "mcp/**",
      "scripts/**",
      "data/**",
      "public/**",
      "*.config.*",
    ],
  },
];

export default eslintConfig;

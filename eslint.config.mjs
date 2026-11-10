import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // These files legitimately use CommonJS (Jest/PostCSS load them with require).
    files: ["*.config.js", "jest.setup.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    // Client-only contexts hydrate their state from localStorage after mount.
    // Reading storage during render would break SSR/hydration, so the effect is
    // the correct place for this one-time state initialisation.
    files: ["src/contexts/**/*.tsx"],
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      // Keep modules reviewable; split by responsibility instead of growing a monolith.
      "max-lines": ["error", { max: 450, skipBlankLines: true, skipComments: true }],
    },
  },
  globalIgnores([
    "node_modules/**",
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;

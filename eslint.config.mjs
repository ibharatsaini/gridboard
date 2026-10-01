import js from "@eslint/js";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: [
      "**/node_modules/**", "**/dist/**", "**/coverage/**",
      "apps/api/src/generated/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true }],
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  { files: ["apps/api/**", "packages/**", "prisma/**", "*.config.*", "apps/web/vite.config.ts"], languageOptions: { globals: globals.node } },
  // Operational scripts and CLIs are allowed to print.
  { files: ["apps/api/scripts/**", "apps/api/src/db/seed.ts", "apps/api/src/server.ts"], rules: { "no-console": "off" } },
  // The browser app: React hooks rules (incl. the React Compiler-era checks), accessibility, fast-refresh safety.
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    ...reactHooks.configs.flat.recommended,
    languageOptions: { globals: globals.browser },
  },
  { files: ["apps/web/**/*.{ts,tsx}"], ...jsxA11y.flatConfigs.recommended },
  { files: ["apps/web/src/**/*.{ts,tsx}"], ...reactRefresh.configs.vite },
];

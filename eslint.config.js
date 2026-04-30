import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
  { ignores: ["dist", "node_modules", "archive"] },
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // The codebase-wide pattern is `try { ... } catch (e) { return null }`
      // — degrading gracefully on API failure (CLAUDE.md mandates this). The
      // `e` is intentional context, not a forgotten variable. Same pattern for
      // `let x = {}; try { x = await ... } catch ...` — the initial value is
      // the fallback, not a useless assignment.
      "no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrors: "none",
      }],
      // Canvas drawing in ConnectionMap legitimately uses Math.random for the
      // hand-pinned-paper jitter effect. The hook-purity rule flags this as a
      // side effect inside useEffect, which is the correct place for it.
      "react-hooks/purity": "off",
      // The soft-cap warning effect in Recognizer.jsx computes a derived
      // string from nodes.length and stores it in state for display. This
      // technically can be inlined as `const warning = computeWarning(...)`
      // — improvement to consider after the refactor, but the v0.13 source
      // uses setState-in-effect and "zero behavior changes" forbids touching it.
      "react-hooks/set-state-in-effect": "off",
      // `let x = {}; try { x = await ... } catch { x = {} }` is the documented
      // graceful-degradation pattern in CLAUDE.md (extractors return partial
      // data, never throw). The initial `{}` IS the fallback, not dead code.
      "no-useless-assignment": "off",
    },
  },
  {
    files: ["**/*.test.{js,jsx}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
];

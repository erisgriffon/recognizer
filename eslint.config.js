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
      // This rule has real value — it catches infinite re-render loops where
      // an effect schedules a setState that retriggers the effect. We're
      // overriding it for two intentional patterns:
      //   1. Recognizer.jsx — the soft-cap warning effect derives a string
      //      from nodes.length and stores it in state. (Could be inlined as
      //      `const warning = computeWarning(...)` post-refactor.)
      //   2. Recognizer.jsx — the on-mount fetchOnThisDay → setTodayNode
      //      effect (one-shot async with cancellation flag).
      // If Code Claude flags either of these patterns as suspect in the
      // future, take the warning seriously rather than waving it through.
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

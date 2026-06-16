// ESLint flat config — WI-0.2 (#111): hooks enforcement, not a style pass.
//
// Scope is deliberately minimal: the two react-hooks rules make principle 13
// ("referential stability is correctness" — complete dependency arrays on every
// useMemo/useCallback/useEffect) machine-checked instead of memory-checked.
// Do NOT add stylistic rule sets here; `npm run lint` must stay actionable.
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default [
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
];

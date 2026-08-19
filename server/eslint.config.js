import globals from "globals";

export default [
  {
    ignores: [
      "node_modules/**",
      "coverage/**",
      "public/mediapipe/**",
      "public/assets/**",
      "public/js/vision_wasm_internal.js",
    ],
  },
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: "warn",
    },
    rules: {
      "no-undef": "warn",
      "no-unused-vars": ["warn", { "args": "none", "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
      "no-unreachable": "error",
      "no-constant-condition": "warn",
      "no-duplicate-case": "error",
      "no-empty": "off",
    },
  },
];

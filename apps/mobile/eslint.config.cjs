const tseslint = require("typescript-eslint");
const globals = require("globals");

module.exports = [
  {
    ignores: [
      "node_modules/**",
      ".expo/**",
      "android/**",
      "coverage/**",
      "dist/**",
    ],
  },
  {
    files: ["**/*.{js,cjs,mjs,jsx,ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {},
  },
];

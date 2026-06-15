module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'import'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
  ],
  rules: {
    // The codebase uses `any` at trust boundaries (untyped request bodies).
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    // TypeScript checks undefined identifiers; eslint's no-undef false-positives
    // on types and imports.
    'no-undef': 'off',
    // TypeScript handles module resolution.
    'import/no-unresolved': 'off',
    // Functions are exported as default-instances (index.ts); allow it.
    'import/no-default-export': 'off',
    // jest.mock() factories use require() (hoisting forbids imports there).
    '@typescript-eslint/no-var-requires': 'off',
    // Tests use `!` after an explicit null-guard assertion.
    '@typescript-eslint/no-non-null-assertion': 'off',
    // Low-value style nit; removing annotations can change a type's width and
    // break comparisons (e.g. LLM_PROVIDER's `: string` widens the literal so
    // the provider switch type-checks).
    '@typescript-eslint/no-inferrable-types': 'off',
  },
  // Note: eslint-config-google is installed but intentionally not extended —
  // the existing code does not follow google style (double quotes, spaced
  // object literals), and imposing it is a separate ~1500-line formatting
  // effort, not part of restoring a working lint. This config targets real
  // correctness issues (unused vars, broken imports) via the recommended sets.
  ignorePatterns: ['lib/', 'node_modules/'],
};

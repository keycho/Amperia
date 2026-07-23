import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  // tests/ = node-side Playwright harnesses (overlap tour, contact sheet) —
  // node globals, not app code; they lint as scripts, not browser TS.
  { ignores: ['dist/', 'node_modules/', 'tests/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['**/*.ts', '../shared/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Shared + economy code must stay `any`-free (CLAUDE.md conventions).
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
);

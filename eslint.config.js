// @ts-check
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');

/** @type {import('eslint').Linter.FlatConfig[]} */
module.exports = [
  // ── Global ignores ──────────────────────────────────────────────────────────
  {
    ignores: ['out/**', 'dist/**', 'node_modules/**'],
  },

  // ── TypeScript base config (all source) ─────────────────────────────────────
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.web.json'],
        tsconfigRootDir: __dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      // TypeScript recommended rules (subset applied manually for flat config)
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',

      // Ban eval and dynamic code execution
      'no-eval': 'error',
      'no-new-func': 'error',

      // Ban dangerous syntax patterns
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Function']",
          message: 'new Function() is banned — use explicit typed functions instead.',
        },
        {
          // Catch template-literal and call-expression forms of new Function
          selector: "CallExpression[callee.name='Function']",
          message: 'Function() constructor is banned.',
        },
      ],

      'no-fallthrough': 'error',
    },
  },

  // ── Renderer: ban Node built-ins ────────────────────────────────────────────
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'fs', message: 'fs is not available in the renderer process.' },
            { name: 'fs/promises', message: 'fs is not available in the renderer process.' },
            { name: 'child_process', message: 'child_process is not available in the renderer process.' },
            { name: 'net', message: 'net is not available in the renderer process.' },
            { name: 'path', message: 'path is not available in the renderer process. Use URL APIs instead.' },
            { name: 'crypto', message: 'crypto is not available in the renderer process. Use window.crypto instead.' },
          ],
        },
      ],
    },
  },

  // ── Main process: ban ipcRenderer (belongs in preload only) ─────────────────
  {
    files: ['src/main/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'electron',
              importNames: ['ipcRenderer'],
              message: 'ipcRenderer must only be used in src/preload — use ipcMain in the main process.',
            },
          ],
        },
      ],
    },
  },

  // ── Config / script files ────────────────────────────────────────────────────
  {
    files: ['*.config.{js,ts}', 'scripts/**/*.{js,ts}', 'vitest.config.ts', 'drizzle.config.ts'],
    languageOptions: {
      parser: tsParser,
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      'no-eval': 'error',
    },
  },
];

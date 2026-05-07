import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'backend/node_modules', 'node_modules']),
  // Backend is CommonJS (Node). Gets Node globals (require/module/process/
  // __dirname) and skips the React-specific plugins. Must come before the
  // frontend block so the more-specific `files` pattern wins.
  {
    files: ['backend/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['error', {
        varsIgnorePattern: '^[A-Z_]|^_',
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },
  // Frontend (React + Vite, ESM).
  {
    files: ['src/**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
      // Disabled: over-aggressive for the common fetch-in-effect pattern
      // (`setLoading(true)` before an async fetch). The cascading-render
      // concern the rule is guarding against doesn't apply to a single
      // loading flag or error reset — turning it off keeps the codebase's
      // existing idiomatic data-fetching effects lint-clean.
      'react-hooks/set-state-in-effect': 'off',
      // Downgraded to warn: HMR-only concern, not a runtime bug. Triggers
      // on legitimate patterns like `Context + useContext` living in one
      // file, which is how every context in src/context/ is structured.
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
])

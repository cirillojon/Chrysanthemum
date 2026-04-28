import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // Disable the base rule — @typescript-eslint/no-unused-vars supersedes it
      'no-unused-vars': 'off',
      // Respect the underscore-prefix convention for intentionally unused vars/args
      '@typescript-eslint/no-unused-vars': ['error', {
        varsIgnorePattern:        '^_',
        argsIgnorePattern:        '^_',
        caughtErrorsIgnorePattern: '^_',
        caughtErrors:             'none', // don't flag unused catch-binding variables
      }],
      // Allow ternary and short-circuit expressions as statements (common React pattern)
      'no-unused-expressions': ['error', {
        allowTernary:      true,
        allowShortCircuit: true,
      }],
    },
  },
)

import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // Build output and the Python pipeline are never linted. The engine package's
  // TypeScript sources and tests are linted with the same rules as the app.
  { ignores: ['dist', 'node_modules', 'packages/*/dist', 'packages/*/node_modules', 'scientific-pipeline'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Small lookup tables live beside the components that use them.
      'react-refresh/only-export-components': 'off',
    },
  },
)

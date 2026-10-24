import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import prettierConfig from 'eslint-config-prettier'
import prettierPlugin from 'eslint-plugin-prettier'
import { defineConfig, globalIgnores } from 'eslint/config'

// At the workspace root, not in apps/web, so the generated API clients are linted too.
const WEB = ['apps/web/**/*.{js,jsx,mjs,ts,tsx}']
// Naming a @typescript-eslint rule against a plain .mjs is a hard config error.
const WEB_TYPESCRIPT = ['apps/web/**/*.{ts,tsx}']
const PACKAGES = ['packages/*/**/*.{ts,mts}']
const MOBILE = ['apps/mobile/**/*.{ts,tsx}']

// core-web-vitals already carries next/typescript, so apps/web needs no nextTs.
const TYPESCRIPT_RULES = {
  '@typescript-eslint/explicit-function-return-type': 'off',
  '@typescript-eslint/explicit-member-accessibility': 'off',
  '@typescript-eslint/no-var-requires': 'off',
  '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  // A deleted local still referenced type-checks against these DOM globals, then throws off the DOM.
  'no-restricted-globals': [
    'error',
    ...['origin', 'name', 'status', 'length', 'closed', 'top', 'parent', 'self', 'event', 'history'].map((name) => ({
      name,
      message: `"${name}" is a DOM global here, not a variable you declared - bind it explicitly.`,
    })),
  ],
}

export default defineConfig([
  globalIgnores([
    '**/.next/**',
    '**/dist/**',
    '**/out/**',
    '**/build/**',
    '**/coverage/**',
    'apps/web/next-env.d.ts',
    // Neither is hand-written: vendored shadcn primitives, and openapi-typescript output.
    'apps/web/src/components/base/**',
    'packages/*/src/schema.ts',
  ]),

  {
    files: WEB,
    extends: [nextVitals],
    settings: { next: { rootDir: 'apps/web' } },
    rules: { 'react/no-unescaped-entities': 'off' },
  },

  {
    files: WEB_TYPESCRIPT,
    rules: TYPESCRIPT_RULES,
  },

  {
    files: PACKAGES,
    extends: [nextTs],
    rules: TYPESCRIPT_RULES,
  },

  {
    // nextTs, not nextVitals: core-web-vitals assumes a DOM React Native doesn't have.
    files: MOBILE,
    extends: [nextTs],
    rules: TYPESCRIPT_RULES,
  },

  {
    files: [...WEB, ...PACKAGES, ...MOBILE],
    extends: [prettierConfig],
    plugins: { prettier: prettierPlugin },
    rules: {
      'prettier/prettier': 'error',
      'no-nested-ternary': 'error',
    },
  },
])

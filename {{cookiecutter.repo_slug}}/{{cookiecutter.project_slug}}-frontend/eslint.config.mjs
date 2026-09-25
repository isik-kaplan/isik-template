import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import prettierConfig from 'eslint-config-prettier'
import prettierPlugin from 'eslint-plugin-prettier'
import { defineConfig, globalIgnores } from 'eslint/config'

// At the workspace root, not in apps/web, so the generated API clients are linted too.
const WEB = ['apps/web/**/*.{js,jsx,mjs,ts,tsx}']
// Separate from WEB because @typescript-eslint only loads for TypeScript files, and naming one of
// its rules against a plain .mjs is a hard config error rather than a no-op.
const WEB_TYPESCRIPT = ['apps/web/**/*.{ts,tsx}']
const PACKAGES = ['packages/*/**/*.{ts,mts}']
// Matches zero files (and lints nothing) when include_mobile is off - the directory simply isn't
// there, same as every other glob-scoped config in this file.
const MOBILE = ['apps/mobile/**/*.{ts,tsx}']

// Shared because both halves load @typescript-eslint - core-web-vitals already carries
// next/typescript, so apps/web does not need nextTs spread in on top of it.
const TYPESCRIPT_RULES = {
  '@typescript-eslint/explicit-function-return-type': 'off',
  '@typescript-eslint/explicit-member-accessibility': 'off',
  '@typescript-eslint/no-var-requires': 'off',
  '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
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
    // nextTs, not nextVitals: core-web-vitals assumes a DOM (img/anchor rules etc.) that React
    // Native doesn't have - the plain TypeScript+React ruleset packages/ already uses fits here too.
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

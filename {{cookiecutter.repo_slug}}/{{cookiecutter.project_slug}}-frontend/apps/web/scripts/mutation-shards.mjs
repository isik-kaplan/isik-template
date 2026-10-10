#!/usr/bin/env node
/**
 * Which source files each mutation shard measures, and the `--mutate` value for one.
 *
 * The mutants are sharded, not the tests: a mutant dies if any test kills it, so a shard holding
 * part of the suite would report "survived" for mutants the rest kills. Every shard runs the whole
 * suite and differs only in what it mutates.
 *
 * Grouped by what a file is for, so a red shard says where to look. Sizes are uneven for that.
 * Re-measure as the suite grows, and divide the shard that stops fitting its CI budget.
 *
 *     node scripts/mutation-shards.mjs --list
 *     node scripts/mutation-shards.mjs --json
 *     npx stryker run --mutate "$(node scripts/mutation-shards.mjs auth)"
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// A `--mutate` on the command line replaces the config's list rather than narrowing it, so its
// exclusions are carried over - read from the config, so the two cannot drift apart.
const EXCLUDED = JSON.parse(readFileSync(join(import.meta.dirname, '../stryker.config.json'), 'utf8')).mutate.filter(
  (pattern) => pattern.startsWith('!')
)

// A route segment like `[key]` is a glob character class, so the path matches nothing and the file
// is silently left unmeasured. `[[]` and `[]]` are classes holding one bracket each, which match it
// literally - unlike a backslash, which Stryker's matcher does not honour.
const escapeGlob = (file) => file.replace(/[[\]]/g, (bracket) => (bracket === '[' ? '[[]' : '[]]'))

export const mutateFor = (shard) => [...SHARDS[shard].map(escapeGlob), ...EXCLUDED].join(',')

export const SHARDS = {
  // Talking to the backend: configuration, the session, i18n plumbing and the request helpers.
  request: [
    'src/config/public.ts',
    'src/config/server.ts',
    'src/i18n/client.ts',
    'src/i18n/config.ts',
    'src/i18n/server.ts',
    'src/lib/LanguageContext.tsx',
    'src/lib/SessionContext.tsx',
    'src/lib/apiClients.ts',
    'src/lib/apiOrigin.ts',
    'src/lib/authOrigin.ts',
    'src/lib/getSession.ts',
    'src/lib/isLocalDevHost.ts',
    'src/lib/nameFetchFailures.ts',
    'src/lib/reauthentication.ts',
    'src/lib/requestOrigin.ts',
    'src/lib/monkeypatches.ts',
    'src/lib/resolveLanguage.ts',
    'src/lib/serverApi.ts',
    'src/lib/sessionChannel.ts',
    'src/lib/socialProviders.ts',
    'src/lib/submit.ts',
    'src/proxy.ts',
  ],
  // Signing in and up, and every screen of that flow.
  auth: [
    'src/app/auth/callback-complete/page.tsx',
    'src/app/auth/complete-signup/page.tsx',
    'src/app/auth/forgot-password/page.tsx',
    'src/app/auth/layout.tsx',
    'src/app/auth/login/page.tsx',
    'src/app/auth/password-reset-email-sent/page.tsx',
    'src/app/auth/password-reset/[key]/page.tsx',
    'src/app/auth/prove/page.tsx',
    'src/app/auth/provider-error/page.tsx',
    'src/app/auth/signup-email-sent/page.tsx',
    'src/app/auth/signup/page.tsx',
    'src/app/auth/verify-email-declined/page.tsx',
    'src/app/auth/verify-email/[key]/page.tsx',
    'src/app/auth/verify-email-required/page.tsx',
    'src/components/app-auth/AuthCard.tsx',
    'src/components/app-auth/AutoFormButton.tsx',
    'src/components/app-auth/CompleteSignupForm.tsx',
    'src/components/app-auth/ForgotPasswordForm.tsx',
    'src/components/app-auth/LoginForm.tsx',
    'src/components/app-auth/PasswordInput.tsx',
    'src/components/app-auth/ProveContent.tsx',
    'src/components/app-auth/ProvePasswordForm.tsx',
    'src/components/app-auth/ProveSetPasswordByEmail.tsx',
    'src/components/app-auth/ProviderIcon.tsx',
    'src/components/app-auth/ResetPasswordForm.tsx',
    'src/components/app-auth/SeparatorWithText.tsx',
    'src/components/app-auth/SignupForm.tsx',
    'src/components/app-auth/SocialLoginButtons.tsx',
    'src/components/app-auth/SocialLoginSection.tsx',
    'src/components/app-auth/VerifyEmailButton.tsx',
    'src/components/app-auth/icons/brands.tsx',
  ],
  // The signed-in account pages: details, emails, password, connections and sessions.
  profile: [
    'src/app/profile/(tabs)/connections/page.tsx',
    'src/app/profile/(tabs)/details/page.tsx',
    'src/app/profile/(tabs)/emails/page.tsx',
    'src/app/profile/(tabs)/layout.tsx',
    'src/app/profile/(tabs)/password/page.tsx',
    'src/app/profile/(tabs)/sessions/page.tsx',
    'src/app/profile/layout.tsx',
    'src/app/profile/page.tsx',
    'src/components/app-auth/ChangePasswordForm.tsx',
    'src/components/app-auth/AccountHistory.tsx',
    'src/components/app-auth/ConnectionsList.tsx',
    'src/components/app-auth/EmailsList.tsx',
    'src/components/app-auth/LogoutButton.tsx',
    'src/components/app-auth/ProfileDetails.tsx',
    'src/components/app-auth/ProfileNameForm.tsx',
    'src/components/app-auth/ProfileTabsList.tsx',
    'src/components/app-auth/SessionsList.tsx',
    'src/lib/formatUserAgent.ts',
    'src/lib/historyLabels.ts',
    'src/lib/useEmailRowActions.ts',
  ],
  // Second factors: the login challenge and the profile tab that enrolls and removes them.
  factors: [
    'src/app/auth/two-factor/page.tsx',
    'src/app/profile/(tabs)/two-factor/page.tsx',
    'src/components/app-auth/MfaChallengeForm.tsx',
    'src/components/app-auth/PasskeyList.tsx',
    'src/components/app-auth/RecoveryCodesReveal.tsx',
    'src/components/app-auth/RecoveryCodesSection.tsx',
    'src/components/app-auth/TotpSetup.tsx',
    'src/lib/useFactorSubmit.ts',
  ],
  // The app shell and the components every screen is built from.
  ui: [
    'src/app/layout.tsx',
    'src/app/manifest.ts',
    'src/app/monkeypatches.tsx',
    'src/app/not-found.tsx',
    'src/app/page.tsx',
    'src/components/app-auth/LanguageSwitcher.tsx',
    'src/components/app/EditMode.tsx',
    'src/components/app/Editor.tsx',
    'src/components/app/Filters/FilterBar.tsx',
    'src/components/app/Filters/ResourceFilters.tsx',
    'src/components/app/Filters/SelectFilter.tsx',
    'src/components/app/Filters/filterSpec.ts',
    'src/components/app/Filters/paging.ts',
    'src/components/app/Filters/useFilterParams.ts',
    'src/components/app/LoadingOverlay.tsx',
    'src/components/app/Markdown.tsx',
    'src/components/app/Overlay.tsx',
    'src/components/app/Paginator.tsx',
    'src/components/app/RemoteCombobox.tsx',
    'src/components/app/ResourcePaginator.tsx',
    'src/components/app/SessionWatcher.tsx',
    'src/components/app/ThemeToggle.tsx',
    'src/components/base/avatar.tsx',
    'src/components/base/badge.tsx',
    'src/components/base/button.tsx',
    'src/components/base/card.tsx',
    'src/components/base/dialog.tsx',
    'src/components/base/drawer.tsx',
    'src/components/base/input.tsx',
    'src/components/base/label.tsx',
    'src/components/base/popover.tsx',
    'src/components/base/segmented-code-input.tsx',
    'src/components/base/separator.tsx',
    'src/components/base/skeleton.tsx',
    'src/components/base/sonner.tsx',
    'src/components/base/tabs.tsx',
    'src/components/base/tooltip.tsx',
    'src/lib/utils.ts',
  ],
}

// Only when run as a command: the shard test imports SHARDS, and a bare import must not exit.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  cli(process.argv[2])
}

function cli(argument) {
  if (argument === '--list') {
    for (const [name, files] of Object.entries(SHARDS)) console.log(`${name} (${files.length} files)`)
  } else if (argument === '--json') {
    // CI builds its matrix from this rather than repeating the names, so a shard added here is
    // dispatched without anyone remembering to add it there.
    console.log(JSON.stringify(Object.keys(SHARDS)))
  } else if (Object.hasOwn(SHARDS, argument ?? '')) {
    console.log(mutateFor(argument))
  } else {
    console.error(`unknown shard ${JSON.stringify(argument)}. one of: ${Object.keys(SHARDS).join(', ')}`)
    process.exit(2)
  }
}

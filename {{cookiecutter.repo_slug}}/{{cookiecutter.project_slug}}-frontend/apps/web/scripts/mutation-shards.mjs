#!/usr/bin/env node
/**
 * Which source files each mutation shard mutates. Mutants are sharded, not tests: a mutant dies to any
 * test, so every shard runs the whole suite. Grouped by purpose, so a red shard says where to look.
 *
 *     npx stryker run --mutate "$(node scripts/mutation-shards.mjs auth)"
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// `--mutate` replaces the config's list rather than narrowing it, so its exclusions are carried over.
const EXCLUDED = JSON.parse(readFileSync(join(import.meta.dirname, '../stryker.config.json'), 'utf8')).mutate.filter(
  (pattern) => pattern.startsWith('!')
)

// `[key]` is a glob character class; `[[]` and `[]]` match a bracket literally, and Stryker ignores backslashes.
const escapeGlob = (file) => file.replace(/[[\]]/g, (bracket) => (bracket === '[' ? '[[]' : '[]]'))

export const mutateFor = (shard) => [...SHARDS[shard].map(escapeGlob), ...EXCLUDED].join(',')

export const SHARDS = {
  // Backend plumbing: config, the session, i18n and request helpers.
  request: [
    'src/config/public.ts',
    'src/config/server.ts',
    'src/i18n/client.ts',
    'src/i18n/config.ts',
    'src/i18n/server.ts',
    'src/lib/LanguageContext.tsx',
    'src/lib/access.ts',
    'src/lib/afterSignIn.ts',
    'src/lib/SessionContext.tsx',
    'src/lib/apiClients.ts',
    'src/lib/apiOrigin.ts',
    'src/lib/authOrigin.ts',
    'src/lib/getSession.ts',
    'src/lib/isLocalDevHost.ts',
    'src/lib/oauthScopes.ts',
    'src/lib/reauthentication.ts',
    'src/lib/requestOrigin.ts',
    'src/lib/monkeypatches.ts',
    'src/lib/resolveLanguage.ts',
    'src/lib/serverApi.ts',
    'src/lib/sessionChannel.ts',
    'src/lib/socialProviders.ts',
    'src/lib/submit.ts',
    'src/lib/tooManyRequests.ts',
    'src/lib/tooManyRequestsMessage.ts',
    'src/lib/visitor.ts',
    'src/proxy.ts',
  ],
  // Signing in and up, and every screen of that flow.
  auth: [
    'src/app/auth/callback-complete/page.tsx',
    'src/app/auth/complete-signup/page.tsx',
    'src/app/auth/forgot-password/page.tsx',
    'src/app/auth/layout.tsx',
    'src/app/auth/login/page.tsx',
    'src/app/auth/oauth/authorize/page.tsx',
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
  // The signed-in account pages.
  profile: [
    'src/app/profile/(tabs)/applications/page.tsx',
    'src/app/profile/(tabs)/connections/page.tsx',
    'src/app/profile/(tabs)/details/page.tsx',
    'src/app/profile/(tabs)/emails/page.tsx',
    'src/app/profile/(tabs)/layout.tsx',
    'src/app/profile/(tabs)/notifications/page.tsx',
    'src/app/profile/(tabs)/password/page.tsx',
    'src/app/profile/(tabs)/sessions/page.tsx',
    'src/app/profile/(tabs)/settings/page.tsx',
    'src/app/profile/(tabs)/tokens/page.tsx',
    'src/app/profile/layout.tsx',
    'src/app/profile/page.tsx',
    'src/components/app-auth/ChangePasswordForm.tsx',
    'src/components/app-auth/AccountHistory.tsx',
    'src/components/app-auth/AuthorizedApplicationsList.tsx',
    'src/components/app-auth/ConnectionsList.tsx',
    'src/components/app-auth/EmailsList.tsx',
    'src/components/app-auth/LogoutButton.tsx',
    'src/components/app-auth/NotificationsList.tsx',
    'src/components/app-auth/PersonalAccessTokenForm.tsx',
    'src/components/app-auth/PersonalAccessTokensList.tsx',
    'src/components/app-auth/ProfileDetails.tsx',
    'src/components/app-auth/ProfileNameForm.tsx',
    'src/components/app-auth/ProfileTabsList.tsx',
    'src/components/app-auth/SessionsList.tsx',
    'src/components/app-auth/SettingsList.tsx',
    'src/lib/formatUserAgent.ts',
    'src/lib/historyLabels.ts',
    'src/lib/useEmailRowActions.ts',
  ],
  // The OAuth provider: registering applications, the consent pages and approvals.
  oauth: [
    'src/app/applications/[id]/page.tsx',
    'src/app/applications/layout.tsx',
    'src/app/applications/new/page.tsx',
    'src/app/applications/page.tsx',
    'src/app/auth/oauth/error/page.tsx',
    'src/app/device/page.tsx',
    'src/app/staff/applications/[id]/page.tsx',
    'src/app/staff/applications/page.tsx',
    'src/components/app-applications/ApplicationLifecycle.tsx',
    'src/components/app-applications/ApplicationStatusBadge.tsx',
    'src/components/app-applications/ApprovalPanel.tsx',
    'src/components/app-applications/EditApplicationForm.tsx',
    'src/components/app-applications/IssuedSecret.tsx',
    'src/components/app-applications/RegisterApplication.tsx',
    'src/components/app-applications/RegisterApplicationForm.tsx',
    'src/components/app-applications/RotateSecretPanel.tsx',
    'src/components/app-applications/ScopeChecklist.tsx',
    'src/components/app-applications/fieldClass.ts',
    'src/components/app-auth/ConsentSignOut.tsx',
    'src/components/app-device/DeviceConsent.tsx',
    'src/lib/applicationApproval.ts',
    'src/lib/applicationGrant.ts',
    'src/lib/redirectUris.ts',
  ],
  // Managing people.
  people: [
    'src/app/staff/layout.tsx',
    'src/app/staff/people/[id]/page.tsx',
    'src/app/staff/people/page.tsx',
    'src/components/app-people/ManageUserForm.tsx',
  ],
  // Second factors: the login challenge and the profile tab.
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
  // The legal pages, the links to them and the cookie disclosure.
  legal: [
    'src/app/legal/[doc]/page.tsx',
    'src/app/legal/layout.tsx',
    'src/app/legal/page.tsx',
    'src/components/app-legal/LegalConsentNotice.tsx',
    'src/components/app-legal/LegalTabsList.tsx',
    'src/components/app-legal/SiteFooter.tsx',
    'src/components/app-legal/StorageDisclosure.tsx',
    'src/lib/legalDocuments.ts',
    'src/lib/readLegalDocument.ts',
    'src/lib/storageDisclosure.ts',
  ],
  // The app shell and shared components.
  ui: [
    'src/app/layout.tsx',
    'src/app/manifest.ts',
    'src/app/monkeypatches.tsx',
    'src/app/not-found.tsx',
    'src/app/too-many-requests/page.tsx',
    'src/app/page.tsx',
    'src/components/app-auth/LanguageSwitcher.tsx',
    'src/components/app/ConflictNotice.tsx',
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
    'src/components/app/PageShell.tsx',
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

// Only when run as a command: the shard test imports SHARDS.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  cli(process.argv[2])
}

function cli(argument) {
  if (argument === '--list') {
    for (const [name, files] of Object.entries(SHARDS)) console.log(`${name} (${files.length} files)`)
  } else if (argument === '--json') {
    // CI builds its matrix from this, so a new shard needs no CI change.
    console.log(JSON.stringify(Object.keys(SHARDS)))
  } else if (Object.hasOwn(SHARDS, argument ?? '')) {
    console.log(mutateFor(argument))
  } else {
    console.error(`unknown shard ${JSON.stringify(argument)}. one of: ${Object.keys(SHARDS).join(', ')}`)
    process.exit(2)
  }
}

import { PersonalAccessTokensList } from '@/components/app-auth/PersonalAccessTokensList'

import { serverApi } from '@/lib/serverApi'

export default async function ProfileTokensPage() {
  // Gating already happened one level up, in profile/layout.tsx.
  const api = await serverApi()
  const [tokens, scopes] = await Promise.all([api.personalAccessTokens(), api.personalAccessTokenScopes()])

  return <PersonalAccessTokensList initialTokens={tokens.data?.results ?? []} scopes={scopes.data ?? []} />
}

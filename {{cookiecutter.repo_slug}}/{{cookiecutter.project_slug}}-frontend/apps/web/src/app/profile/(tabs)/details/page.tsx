import { AccountHistory } from '@/components/app-auth/AccountHistory'
import { ProfileDetails } from '@/components/app-auth/ProfileDetails'
import type { Asked } from '@/components/app/Filters/filterSpec'

import { requireSession } from '@/lib/getSession'
import { serverApi } from '@/lib/serverApi'

import { etagOf } from '@{{ cookiecutter.repo_slug }}/api'

export default async function ProfileDetailsPage({ searchParams }: { searchParams: Promise<Asked> }) {
  const session = await requireSession()
  const { data: me, response } = await (await serverApi()).me()

  return (
    <div className="flex flex-col gap-6">
      {/* The session's copy when the API cannot answer; with no version, a save from it is refused. */}
      <ProfileDetails
        user={me ? { ...me, etag: etagOf(response) } : { ...session.user, first_name: '', last_name: '', etag: null }}
      />
      <AccountHistory userId={session.user.id} asked={await searchParams} />
    </div>
  )
}

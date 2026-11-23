import { AccountHistory } from '@/components/app-auth/AccountHistory'
import { DeleteAccount } from '@/components/app-auth/DeleteAccount'
import { ProfileDetails } from '@/components/app-auth/ProfileDetails'
import type { Asked } from '@/components/app/Filters/filterSpec'

import { requireSession } from '@/lib/getSession'
import { serverApi } from '@/lib/serverApi'

import { etagOf } from '@{{ cookiecutter.repo_slug }}/api'

export default async function ProfileDetailsPage({ searchParams }: { searchParams: Promise<Asked> }) {
  const session = await requireSession()
  const api = await serverApi()
  const [{ data: me, response }, { data: deletion }] = await Promise.all([api.me(), api.accountDeletion()])

  return (
    <div className="flex flex-col gap-6">
      {/* The session's copy when the API cannot answer; with no version, a save from it is refused. */}
      <ProfileDetails
        user={me ? { ...me, etag: etagOf(response) } : { ...session.user, first_name: '', last_name: '', etag: null }}
      />
      <AccountHistory userId={session.user.id} asked={await searchParams} />
      {/* Without the API's answer there is nothing true to say about what deleting would do. */}
      {deletion && <DeleteAccount deletion={deletion} />}
    </div>
  )
}

import { AccountHistory } from '@/components/app-auth/AccountHistory'
import { ProfileDetails } from '@/components/app-auth/ProfileDetails'
import type { Asked } from '@/components/app/Filters/filterSpec'

import { requireSession } from '@/lib/getSession'
import { serverApi } from '@/lib/serverApi'

export default async function ProfileDetailsPage({ searchParams }: { searchParams: Promise<Asked> }) {
  const session = await requireSession()
  const { data: me } = await (await serverApi()).me()

  return (
    <div className="flex flex-col gap-6">
      {/* The session's own copy when the API cannot answer: the names stay unset rather than the
          whole tab failing, and saving still goes through the API either way. */}
      <ProfileDetails user={me ?? { ...session.user, first_name: '', last_name: '' }} />
      <AccountHistory userId={session.user.id} asked={await searchParams} />
    </div>
  )
}

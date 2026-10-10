'use client'

import { Card, CardContent, CardDescription, CardHeader } from '@/components/base/card'

import { useClientTranslation } from '@/i18n/client'
import {
  STORAGE_DISCLOSURE_ANCHOR,
  STORAGE_ITEMS,
  storageKindLabels,
  storagePurposeLabels,
} from '@/lib/storageDisclosure'

/** The cookies-and-storage section, rendered from the disclosure list rather than written into the policy by hand,
 * so the policy cannot fall behind what the site really sets. */
export function StorageDisclosure() {
  const { t } = useClientTranslation(['legal'])
  const kinds = storageKindLabels(t)
  const purposes = storagePurposeLabels(t)

  return (
    <section id={STORAGE_DISCLOSURE_ANCHOR} aria-labelledby="storage-disclosure-heading" className="scroll-mt-6">
      <Card>
        <CardHeader>
          <h2 id="storage-disclosure-heading" className="leading-none font-semibold">
            {t('legal:storageHeading')}
          </h2>
          <CardDescription>{t('legal:storageIntro')}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="py-2 pr-4 font-medium">
                  {t('legal:storageNameColumn')}
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  {t('legal:storageKindColumn')}
                </th>
                <th scope="col" className="py-2 font-medium">
                  {t('legal:storagePurposeColumn')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {STORAGE_ITEMS.map((item) => (
                <tr key={item.name}>
                  <th scope="row" className="py-2 pr-4 font-mono font-normal">
                    {item.name}
                  </th>
                  <td className="py-2 pr-4">{kinds[item.kind]}</td>
                  <td className="py-2">{purposes[item.purpose]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </section>
  )
}

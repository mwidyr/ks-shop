import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import client from '../api/client'

export default function PickupPublic() {
  const { t } = useTranslation()
  const { token } = useParams()
  const [link, setLink] = useState(null)
  const [error, setError] = useState('')

  const statusText = {
    perlu_diproses: t('page_pickup_public.status_perlu_diproses'),
    menunggu_pilih: t('page_pickup_public.status_menunggu_pilih'),
    selesai: t('page_pickup_public.status_selesai'),
    batal: t('page_pickup_public.status_batal'),
    kedaluwarsa: t('page_pickup_public.status_kedaluwarsa'),
  }

  useEffect(() => {
    client.get(`/public/pickup/${token}`)
      .then((res) => setLink(res.data))
      .catch(() => setError(t('page_pickup_public.link_not_found')))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-2xl shadow-sm p-8 max-w-sm w-full text-center">
        {error ? (
          <p className="text-red-600">{error}</p>
        ) : !link ? (
          <p className="text-gray-500">{t('common.loading')}</p>
        ) : (
          <>
            <h1 className="text-lg font-bold text-gray-800 mb-2">{link.label}</h1>
            <p className="text-sm text-gray-500">{statusText[link.status] || link.status}</p>
          </>
        )}
      </div>
    </div>
  )
}

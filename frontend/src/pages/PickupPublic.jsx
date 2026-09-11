import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import client from '../api/client'

const statusText = {
  perlu_diproses: 'Pesanan Anda sedang diproses.',
  menunggu_pilih: 'Silakan pilih pesanan Anda yang siap diambil.',
  selesai: 'Pesanan Anda sudah selesai diambil.',
  batal: 'Tautan ini sudah tidak berlaku.',
  kedaluwarsa: 'Tautan ini sudah kedaluwarsa.',
}

export default function PickupPublic() {
  const { token } = useParams()
  const [link, setLink] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    client.get(`/public/pickup/${token}`)
      .then((res) => setLink(res.data))
      .catch(() => setError('Tautan tidak ditemukan atau sudah tidak berlaku.'))
  }, [token])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-2xl shadow-sm p-8 max-w-sm w-full text-center">
        {error ? (
          <p className="text-red-600">{error}</p>
        ) : !link ? (
          <p className="text-gray-500">Memuat...</p>
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

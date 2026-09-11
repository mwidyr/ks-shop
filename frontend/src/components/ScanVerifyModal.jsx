import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { IconClose } from './icons'

// Real barcode/QR scanning via the device camera (getUserMedia), used to verify an item's
// SKU during picking ("Pindai Verifikasi" in the reference). Decoded text is matched against
// the order's item SKUs by the caller via onMatch.
export default function ScanVerifyModal({ onMatch, onClose }) {
  const videoRef = useRef(null)
  const controlsRef = useRef(null)
  const [error, setError] = useState('')
  const [lastCode, setLastCode] = useState('')

  useEffect(() => {
    const reader = new BrowserMultiFormatReader()
    let cancelled = false

    reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
      if (result && !cancelled) {
        const text = result.getText()
        setLastCode(text)
        onMatch(text)
      }
    }).then((controls) => {
      if (cancelled) controls.stop()
      else controlsRef.current = controls
    }).catch((err) => {
      setError(err?.message || 'Tidak bisa mengakses kamera. Pastikan izin kamera diaktifkan.')
    })

    return () => {
      cancelled = true
      controlsRef.current?.stop()
    }
  }, [onMatch])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-white rounded-2xl p-5 w-full max-w-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-gray-800">Pindai Verifikasi</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><IconClose /></button>
        </div>
        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : (
          <>
            <video ref={videoRef} className="w-full rounded-xl bg-black aspect-square object-cover" muted playsInline />
            <p className="text-xs text-gray-500 mt-2 text-center">Arahkan kamera ke barcode/QR SKU produk.</p>
            {lastCode && <p className="text-xs font-mono text-green-600 mt-1 text-center">Terbaca: {lastCode}</p>}
          </>
        )}
      </div>
    </div>
  )
}

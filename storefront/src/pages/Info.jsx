import { Link, useParams } from 'react-router-dom'
import { useStore } from '../lib/useSettings'
import { money } from '../lib/format'

// Static help pages. Copy is a sensible default - the business should review/edit the wording
// (payment methods, return window, contact details) before launch.
export default function Info() {
  const { slug } = useParams()
  const { settings } = useStore()
  const free = settings?.free_shipping_minimarket ? money(settings.free_shipping_minimarket) : 'jumlah tertentu'
  const pages = {
    faq: ['FAQ', [
      ['Bagaimana cara memesan?', 'Pilih produk, tambahkan ke keranjang, lalu checkout. Isi nama, nomor HP, dan metode pengambilan. Tim kami akan menghubungimu untuk konfirmasi.'],
      ['Apakah saya perlu membuat akun?', 'Tidak perlu. Kamu bisa checkout sebagai tamu dan melacak pesanan lewat nomor pesanan dan nomor HP.'],
      ['Metode pengambilan apa saja yang tersedia?', 'Ambil di 7-Eleven atau FamilyMart (masukkan kode toko 6 digit), atau kirim ke alamat rumah.'],
      ['Kapan gratis ongkir?', `Gratis ongkir berlaku untuk pembelian min. ${free}.`],
    ]],
    pembayaran: ['Pembayaran', [
      ['Cara pembayaran', 'Setelah pesanan dibuat, tim Ralulu menghubungimu lewat nomor HP untuk konfirmasi dan menginformasikan cara pembayaran.'],
      ['Voucher', 'Masukkan kode voucher di keranjang atau checkout. Potongan langsung terlihat di total.'],
    ]],
    retur: ['Penukaran & Pengembalian', [
      ['Kapan bisa tukar / refund?', 'Jika barang cacat, rusak, atau salah kirim, hubungi kami secepatnya setelah barang diterima dengan menyertakan nomor pesanan dan foto barang.'],
      ['Syarat', 'Barang belum dipakai/dicuci dan label masih terpasang, kecuali cacat produksi.'],
    ]],
    privasi: ['Kebijakan Privasi', [
      ['Data yang kami simpan', 'Nama, nomor HP, alamat/toko pengambilan, dan email (jika diisi) hanya dipakai untuk memproses dan mengirim pesananmu.'],
      ['Newsletter', 'Email newsletter hanya dikirim kepada yang mendaftar dan bisa berhenti kapan saja.'],
    ]],
    kontak: ['Hubungi Kami', [
      ['Butuh bantuan?', 'Hubungi tim Ralulu lewat nomor HP yang kamu gunakan saat memesan, atau sebutkan nomor pesananmu agar kami bisa membantu lebih cepat.'],
    ]],
  }
  const page = pages[slug]
  if (!page) return <div className="max-w-xl mx-auto py-24 text-center"><p>Halaman tidak ditemukan.</p><Link to="/" className="btn btn-dark mt-6">Ke beranda</Link></div>
  return (
    <div className="max-w-3xl mx-auto px-4 pt-10">
      <h1 className="font-display text-4xl tracking-wide">{page[0].toUpperCase()}</h1>
      <div className="mt-6 divide-y border-y">
        {page[1].map(([q, a]) => <section key={q} className="py-5"><h2 className="font-semibold">{q}</h2><p className="text-sm text-gray-700 mt-1.5 leading-relaxed">{a}</p></section>)}
      </div>
    </div>
  )
}

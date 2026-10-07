import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useCart } from '../lib/cart'
import { useStore } from '../lib/useSettings'
import { money } from '../lib/format'
import { BagIcon, ChevronDown, CloseIcon, Logo, MenuIcon, SearchIcon } from './Icons'
import SearchOverlay from './SearchOverlay'

export default function Header() {
  const cart = useCart()
  const { settings, categories, promotions } = useStore()
  const [searchOpen, setSearchOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [megaOpen, setMegaOpen] = useState(false)
  const location = useLocation()

  useEffect(() => { setMobileOpen(false); setMegaOpen(false); setSearchOpen(false) }, [location.pathname, location.search])
  useEffect(() => {
    document.body.style.overflow = searchOpen || mobileOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [searchOpen, mobileOpen])

  const threshold = settings?.free_shipping_minimarket || 0
  const navLink = ({ isActive }) => `text-sm font-semibold uppercase tracking-wide py-5 hover:text-brand-600 ${isActive ? 'text-brand-600' : ''}`

  return (
    <header className="sticky top-0 z-50 bg-white border-b">
      <div className="bg-black text-white text-center text-xs py-2 px-3">
        {threshold > 0 ? <>Gratis ongkir untuk pembelian min. <b>{money(threshold)}</b></> : 'Selamat datang di Ralulu'}
      </div>

      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-16">
        <button className="lg:hidden -ml-1 p-1" onClick={() => setMobileOpen(true)} aria-label="Menu"><MenuIcon /></button>
        <Link to="/" className="lg:mr-10" aria-label="Ralulu"><Logo /></Link>

        <nav className="hidden lg:flex items-center gap-8 flex-1">
          <NavLink to="/koleksi/baru" className={navLink}>Koleksi Baru</NavLink>
          <div className="relative" onMouseEnter={() => setMegaOpen(true)} onMouseLeave={() => setMegaOpen(false)}>
            <NavLink to="/produk" end className={(s) => `${navLink(s)} inline-flex items-center gap-1`}>Produk <ChevronDown /></NavLink>
            {megaOpen && (
              <div className="absolute left-0 top-full w-[520px] bg-white border shadow-lg p-6 grid grid-cols-2 gap-8">
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-400 mb-3">Promo</p>
                  <ul className="space-y-2 text-sm">
                    <li><Link className="hover:text-brand-600" to="/promo">Semua voucher</Link></li>
                    <li><Link className="hover:text-brand-600" to="/sale">Sale</Link></li>
                    {threshold > 0 && <li><Link className="hover:text-brand-600" to="/promo">Gratis ongkir min. {money(threshold)}</Link></li>}
                    {promotions.slice(0, 3).map((p) => <li key={p.code}><Link className="hover:text-brand-600" to="/promo">{p.code}</Link></li>)}
                  </ul>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-400 mb-3">Kategori</p>
                  <ul className="space-y-2 text-sm">
                    <li><Link className="hover:text-brand-600" to="/produk">Semua Produk</Link></li>
                    {categories.map((c) => <li key={c.name}><Link className="hover:text-brand-600" to={`/kategori/${encodeURIComponent(c.name)}`}>{c.display}</Link></li>)}
                  </ul>
                </div>
              </div>
            )}
          </div>
          <NavLink to="/sale" className={navLink}>Sale</NavLink>
          <NavLink to="/promo" className={navLink}>Promo</NavLink>
          <NavLink to="/lacak" className={navLink}>Lacak Pesanan</NavLink>
        </nav>

        <div className="flex items-center gap-4">
          <button onClick={() => setSearchOpen(true)} aria-label="Cari"><SearchIcon /></button>
          <button onClick={cart.openDrawer} className="relative" aria-label="Keranjang">
            <BagIcon />
            {cart.count > 0 && <span className="absolute -top-1.5 -right-2 bg-brand-600 text-white text-[10px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1">{cart.count}</span>}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-[75] lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-4/5 max-w-xs bg-white overflow-y-auto">
            <div className="flex items-center justify-between px-5 h-16 border-b"><Logo /><button onClick={() => setMobileOpen(false)} aria-label="Tutup"><CloseIcon /></button></div>
            <ul className="px-5 py-4 text-sm font-semibold uppercase tracking-wide divide-y">
              <li><Link className="block py-3" to="/koleksi/baru">Koleksi Baru</Link></li>
              <li><Link className="block py-3" to="/produk">Semua Produk</Link></li>
              {categories.map((c) => <li key={c.name}><Link className="block py-3 pl-4 font-normal normal-case tracking-normal" to={`/kategori/${encodeURIComponent(c.name)}`}>{c.display}</Link></li>)}
              <li><Link className="block py-3" to="/sale">Sale</Link></li>
              <li><Link className="block py-3" to="/promo">Promo & Voucher</Link></li>
              <li><Link className="block py-3" to="/lacak">Lacak Pesanan</Link></li>
            </ul>
          </div>
        </div>
      )}

      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} />}
    </header>
  )
}

import { useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import Header from './components/Header'
import Footer from './components/Footer'
import CartDrawer from './components/CartDrawer'
import Home from './pages/Home'
import Collection from './pages/Collection'
import ProductDetail from './pages/ProductDetail'
import Cart from './pages/Cart'
import Checkout from './pages/Checkout'
import OrderSuccess from './pages/OrderSuccess'
import Track from './pages/Track'
import Promo from './pages/Promo'
import Info from './pages/Info'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Header />
      <main className="min-h-[60vh]">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/produk" element={<Collection mode="all" />} />
          <Route path="/koleksi/baru" element={<Collection mode="new" />} />
          <Route path="/sale" element={<Collection mode="sale" />} />
          <Route path="/kategori/:name" element={<Collection mode="category" />} />
          <Route path="/produk/:id" element={<ProductDetail />} />
          <Route path="/keranjang" element={<Cart />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/pesanan/:orderNo" element={<OrderSuccess />} />
          <Route path="/lacak" element={<Track />} />
          <Route path="/promo" element={<Promo />} />
          <Route path="/info/:slug" element={<Info />} />
          <Route path="*" element={<div className="max-w-xl mx-auto py-24 text-center px-4"><h1 className="font-display text-5xl">404</h1><p className="text-gray-500 mt-2">Halaman tidak ditemukan.</p></div>} />
        </Routes>
      </main>
      <Footer />
      <CartDrawer />
    </>
  )
}

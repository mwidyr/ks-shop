import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { EmptyState, Spinner } from './components/ui'
import Home from './pages/Home'

const page = (f) => lazy(f)
const Categories = page(() => import('./pages/Categories'))
const ProductList = page(() => import('./pages/ProductList'))
const Product = page(() => import('./pages/Product'))
const Cart = page(() => import('./pages/Cart'))
const Checkout = page(() => import('./pages/Checkout'))
const CheckoutSuccess = page(() => import('./pages/CheckoutSuccess'))
const Search = page(() => import('./pages/Search'))
const Menu = page(() => import('./pages/Menu'))
const Wishlist = page(() => import('./pages/Wishlist'))
const Coupons = page(() => import('./pages/Coupons'))
const Orders = page(() => import('./pages/Orders'))
const OrderDetail = page(() => import('./pages/OrderDetail'))
const Return = page(() => import('./pages/Return'))
const Service = page(() => import('./pages/Service'))
const Language = page(() => import('./pages/Language'))
const Hosts = page(() => import('./pages/Hosts'))
const Host = page(() => import('./pages/Host'))
const Live = page(() => import('./pages/Live'))
const Style = page(() => import('./pages/Style'))
const Content = page(() => import('./pages/Content'))
const Info = page(() => import('./pages/Info'))
const Profile = page(() => import('./pages/Profile'))
const Member = page(() => import('./pages/Member'))
const Login = page(() => import('./pages/Login'))
const Wallet = page(() => import('./pages/Wallet'))

export default function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/products" element={<ProductList />} />
          <Route path="/c/:name" element={<ProductList />} />
          <Route path="/p/:id" element={<Product />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/checkout/success" element={<CheckoutSuccess />} />
          <Route path="/search" element={<Search />} />
          <Route path="/menu" element={<Menu />} />
          <Route path="/wishlist" element={<Wishlist />} />
          <Route path="/coupons" element={<Coupons />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/orders/:orderNo" element={<OrderDetail />} />
          <Route path="/orders/:orderNo/return" element={<Return />} />
          <Route path="/service" element={<Service />} />
          <Route path="/language" element={<Language />} />
          <Route path="/hosts" element={<Hosts />} />
          <Route path="/hosts/:slug" element={<Host />} />
          <Route path="/hosts/:slug/journal/:slug2" element={<Content />} />
          <Route path="/live" element={<Live />} />
          <Route path="/style" element={<Style />} />
          <Route path="/style/:slug" element={<Content />} />
          <Route path="/info/:slug" element={<Info />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/member" element={<Member />} />
          <Route path="/login" element={<Login />} />
          <Route path="/wallet" element={<Wallet />} />
          <Route path="*" element={<EmptyState title="404" />} />
        </Route>
      </Routes>
    </Suspense>
  )
}

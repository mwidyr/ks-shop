import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import Login from './pages/Login'
import Orders from './pages/Orders'
import OrderCreate from './pages/OrderCreate'
import OrderDetail from './pages/OrderDetail'
import OrderPrint from './pages/OrderPrint'
import Products from './pages/Products'
import ProductForm from './pages/ProductForm'
import Settings from './pages/Settings'
import Dashboard from './pages/Dashboard'
import Customers from './pages/Customers'
import Inventory from './pages/Inventory'
import Profit from './pages/Profit'
import Categories from './pages/Categories'
import Chat from './pages/Chat'
import Reviews from './pages/Reviews'
import Warehouses from './pages/Warehouses'
import Shipping from './pages/Shipping'
import Returns from './pages/Returns'
import Refunds from './pages/Refunds'
import Promotions from './pages/Promotions'
import Campaigns from './pages/Campaigns'
import Advertising from './pages/Advertising'
import SalesAnalyticsDetail from './pages/SalesAnalyticsDetail'
import ProductAnalytics from './pages/ProductAnalytics'
import Transactions from './pages/Transactions'
import Payouts from './pages/Payouts'
import Fees from './pages/Fees'
import Reports from './pages/Reports'
import StoreProfile from './pages/StoreProfile'
import StoreDesign from './pages/StoreDesign'
import RolesMatrix from './pages/RolesMatrix'
import Notifications from './pages/Notifications'
import Integrations from './pages/Integrations'
import AuditLog from './pages/AuditLog'
import { useAuth } from './context/AuthContext'

function ProtectedRoute({ children }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return <AppShell>{children}</AppShell>
}

function RequireAuth({ children }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  const { user } = useAuth()

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route path="/" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />

      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />

      {/* Sales */}
      <Route path="/orders" element={<ProtectedRoute><Orders /></ProtectedRoute>} />
      <Route path="/orders/new" element={<ProtectedRoute><OrderCreate /></ProtectedRoute>} />
      <Route path="/orders/:id" element={<ProtectedRoute><OrderDetail /></ProtectedRoute>} />
      <Route path="/customers" element={<ProtectedRoute><Customers /></ProtectedRoute>} />
      <Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
      <Route path="/reviews" element={<ProtectedRoute><Reviews /></ProtectedRoute>} />

      {/* Order print views: no sidebar chrome, still requires login */}
      <Route path="/orders/:id/print/:type" element={<RequireAuth><OrderPrint /></RequireAuth>} />
      <Route path="/orders/print/:type" element={<RequireAuth><OrderPrint /></RequireAuth>} />

      {/* Catalog */}
      <Route path="/products" element={<ProtectedRoute><Products /></ProtectedRoute>} />
      <Route path="/products/new" element={<ProtectedRoute><ProductForm /></ProtectedRoute>} />
      <Route path="/products/:id/edit" element={<ProtectedRoute><ProductForm /></ProtectedRoute>} />
      <Route path="/categories" element={<ProtectedRoute><Categories /></ProtectedRoute>} />
      <Route path="/inventory" element={<ProtectedRoute><Inventory /></ProtectedRoute>} />
      <Route path="/warehouses" element={<ProtectedRoute><Warehouses /></ProtectedRoute>} />

      {/* Fulfillment */}
      <Route path="/shipping" element={<ProtectedRoute><Shipping /></ProtectedRoute>} />
      <Route path="/returns" element={<ProtectedRoute><Returns /></ProtectedRoute>} />
      <Route path="/refunds" element={<ProtectedRoute><Refunds /></ProtectedRoute>} />

      {/* Marketing */}
      <Route path="/promotions" element={<ProtectedRoute><Promotions /></ProtectedRoute>} />
      <Route path="/campaigns" element={<ProtectedRoute><Campaigns /></ProtectedRoute>} />
      <Route path="/advertising" element={<ProtectedRoute><Advertising /></ProtectedRoute>} />

      {/* Analytics */}
      <Route path="/analytics/sales" element={<ProtectedRoute><SalesAnalyticsDetail /></ProtectedRoute>} />
      <Route path="/analytics/products" element={<ProtectedRoute><ProductAnalytics /></ProtectedRoute>} />
      <Route path="/profit" element={<ProtectedRoute><Profit /></ProtectedRoute>} />

      {/* Finance */}
      <Route path="/finance/transactions" element={<ProtectedRoute><Transactions /></ProtectedRoute>} />
      <Route path="/finance/payouts" element={<ProtectedRoute><Payouts /></ProtectedRoute>} />
      <Route path="/finance/fees" element={<ProtectedRoute><Fees /></ProtectedRoute>} />
      <Route path="/finance/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />

      {/* Store */}
      <Route path="/store/profile" element={<ProtectedRoute><StoreProfile /></ProtectedRoute>} />
      <Route path="/store/design" element={<ProtectedRoute><StoreDesign /></ProtectedRoute>} />
      <Route path="/store/team" element={<ProtectedRoute><RolesMatrix /></ProtectedRoute>} />

      {/* System */}
      <Route path="/system/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
      <Route path="/system/integrations" element={<ProtectedRoute><Integrations /></ProtectedRoute>} />
      <Route path="/system/roles" element={<ProtectedRoute><RolesMatrix /></ProtectedRoute>} />
      <Route path="/system/audit-logs" element={<ProtectedRoute><AuditLog /></ProtectedRoute>} />

      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
    </Routes>
  )
}

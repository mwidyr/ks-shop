import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import { useAuth } from './context/AuthContext'

// Route-level code splitting: each page is only transformed/downloaded when actually
// navigated to, instead of the whole ~45-page tree loading up front on every visit.
const Login = lazy(() => import('./pages/Login'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const AcceptInvite = lazy(() => import('./pages/AcceptInvite'))
const Orders = lazy(() => import('./pages/Orders'))
const OrderCreate = lazy(() => import('./pages/OrderCreate'))
const MergeOrders = lazy(() => import('./pages/MergeOrders'))
const OrderDetail = lazy(() => import('./pages/OrderDetail'))
const OrderPrint = lazy(() => import('./pages/OrderPrint'))
const Products = lazy(() => import('./pages/Products'))
const ProductForm = lazy(() => import('./pages/ProductForm'))
const Settings = lazy(() => import('./pages/Settings'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Customers = lazy(() => import('./pages/Customers'))
const Inventory = lazy(() => import('./pages/Inventory'))
const Profit = lazy(() => import('./pages/Profit'))
const Categories = lazy(() => import('./pages/Categories'))
const Chat = lazy(() => import('./pages/Chat'))
const Reviews = lazy(() => import('./pages/Reviews'))
const Warehouses = lazy(() => import('./pages/Warehouses'))
const Suppliers = lazy(() => import('./pages/Suppliers'))
const SupplierDetail = lazy(() => import('./pages/SupplierDetail'))
const Purchases = lazy(() => import('./pages/Purchases'))
const PurchaseHistory = lazy(() => import('./pages/PurchaseHistory'))
const ReplenishmentPlanning = lazy(() => import('./pages/ReplenishmentPlanning'))
const Shipping = lazy(() => import('./pages/Shipping'))
const ShippingExport = lazy(() => import('./pages/ShippingExport'))
const DaftarPengambilan = lazy(() => import('./pages/DaftarPengambilan'))
const PanelSiaran = lazy(() => import('./pages/PanelSiaran'))
const LiveSessionHistory = lazy(() => import('./pages/LiveSessionHistory'))
const LiveSessionNew = lazy(() => import('./pages/LiveSessionNew'))
const LiveSessionDetail = lazy(() => import('./pages/LiveSessionDetail'))
const PickupPublic = lazy(() => import('./pages/PickupPublic'))
const Returns = lazy(() => import('./pages/Returns'))
const Refunds = lazy(() => import('./pages/Refunds'))
const Promotions = lazy(() => import('./pages/Promotions'))
const Campaigns = lazy(() => import('./pages/Campaigns'))
const Advertising = lazy(() => import('./pages/Advertising'))
const SalesAnalyticsDetail = lazy(() => import('./pages/SalesAnalyticsDetail'))
const ProductAnalytics = lazy(() => import('./pages/ProductAnalytics'))
const ProductPerformance = lazy(() => import('./pages/ProductPerformance'))
const ProductColorPair = lazy(() => import('./pages/ProductColorPair'))
const HostCategoryLeaderboard = lazy(() => import('./pages/HostCategoryLeaderboard'))
const PerformanceDashboard = lazy(() => import('./pages/PerformanceDashboard'))
const HostPerformanceAnalytics = lazy(() => import('./pages/HostPerformanceAnalytics'))
const Heatmap = lazy(() => import('./pages/Heatmap'))
const Transactions = lazy(() => import('./pages/Transactions'))
const Payouts = lazy(() => import('./pages/Payouts'))
const Fees = lazy(() => import('./pages/Fees'))
const Reports = lazy(() => import('./pages/Reports'))
const StoreProfile = lazy(() => import('./pages/StoreProfile'))
const StoreDesign = lazy(() => import('./pages/StoreDesign'))
const RolesMatrix = lazy(() => import('./pages/RolesMatrix'))
const Notifications = lazy(() => import('./pages/Notifications'))
const Integrations = lazy(() => import('./pages/Integrations'))
const AuditLog = lazy(() => import('./pages/AuditLog'))
const HostManagement = lazy(() => import('./pages/HostManagement'))
const ShippingSettings = lazy(() => import('./pages/ShippingSettings'))

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

function PageLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">
      Loading...
    </div>
  )
}

export default function App() {
  const { user } = useAuth()

  return (
    <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/accept-invite" element={<AcceptInvite />} />
        <Route path="/" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
        <Route path="/pickup/:token" element={<PickupPublic />} />

        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />

        {/* Sales */}
        <Route path="/panel-siaran" element={<ProtectedRoute><PanelSiaran /></ProtectedRoute>} />
        <Route path="/panel-siaran/history" element={<ProtectedRoute><LiveSessionHistory /></ProtectedRoute>} />
        <Route path="/panel-siaran/new" element={<ProtectedRoute><LiveSessionNew /></ProtectedRoute>} />
        <Route path="/panel-siaran/:id" element={<ProtectedRoute><LiveSessionDetail /></ProtectedRoute>} />
        <Route path="/orders" element={<ProtectedRoute><Orders /></ProtectedRoute>} />
        <Route path="/orders/new" element={<ProtectedRoute><OrderCreate /></ProtectedRoute>} />
        <Route path="/orders/merge" element={<ProtectedRoute><MergeOrders /></ProtectedRoute>} />
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
        <Route path="/suppliers" element={<ProtectedRoute><Suppliers /></ProtectedRoute>} />
        <Route path="/suppliers/:id" element={<ProtectedRoute><SupplierDetail /></ProtectedRoute>} />
        <Route path="/purchases" element={<ProtectedRoute><Purchases /></ProtectedRoute>} />
        <Route path="/purchases/history" element={<ProtectedRoute><PurchaseHistory /></ProtectedRoute>} />
        <Route path="/replenishment-planning" element={<ProtectedRoute><ReplenishmentPlanning /></ProtectedRoute>} />

        {/* Fulfillment */}
        <Route path="/shipping" element={<ProtectedRoute><Shipping /></ProtectedRoute>} />
        <Route path="/shipping/export" element={<ProtectedRoute><ShippingExport /></ProtectedRoute>} />
        <Route path="/picking" element={<ProtectedRoute><DaftarPengambilan /></ProtectedRoute>} />
        <Route path="/returns" element={<ProtectedRoute><Returns /></ProtectedRoute>} />
        <Route path="/refunds" element={<ProtectedRoute><Refunds /></ProtectedRoute>} />

        {/* Marketing */}
        <Route path="/promotions" element={<ProtectedRoute><Promotions /></ProtectedRoute>} />
        <Route path="/campaigns" element={<ProtectedRoute><Campaigns /></ProtectedRoute>} />
        <Route path="/advertising" element={<ProtectedRoute><Advertising /></ProtectedRoute>} />

        {/* Analytics */}
        <Route path="/analytics/sales" element={<ProtectedRoute><SalesAnalyticsDetail /></ProtectedRoute>} />
        <Route path="/analytics/products" element={<ProtectedRoute><ProductAnalytics /></ProtectedRoute>} />
        <Route path="/analytics/product-performance" element={<ProtectedRoute><ProductPerformance /></ProtectedRoute>} />
        <Route path="/analytics/product-color-pair" element={<ProtectedRoute><ProductColorPair /></ProtectedRoute>} />
        <Route path="/analytics/host-category-leaderboard" element={<ProtectedRoute><HostCategoryLeaderboard /></ProtectedRoute>} />
        <Route path="/analytics/performance-dashboard" element={<ProtectedRoute><PerformanceDashboard /></ProtectedRoute>} />
        <Route path="/analytics/host-performance" element={<ProtectedRoute><HostPerformanceAnalytics /></ProtectedRoute>} />
        <Route path="/analytics/heatmap" element={<ProtectedRoute><Heatmap /></ProtectedRoute>} />
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

        <Route path="/hosts" element={<ProtectedRoute><HostManagement /></ProtectedRoute>} />
        <Route path="/settings/shipping" element={<ProtectedRoute><ShippingSettings /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      </Routes>
    </Suspense>
  )
}

import { lazy, Suspense, type ReactElement } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import AppFrame from './components/AppFrame';
import PublicFrame from './components/PublicFrame';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const HousesPage = lazy(() => import('./pages/HousesPage'));
const HousePage = lazy(() => import('./pages/HousePage'));
const ReceiptHistoryPage = lazy(() => import('./pages/ReceiptHistoryPage'));
const ReceiptScanPage = lazy(() => import('./pages/ReceiptScanPage'));
const InventoryPage = lazy(() => import('./pages/InventoryPage'));
const ShoppingPage = lazy(() => import('./pages/ShoppingPage'));
const JoinPage = lazy(() => import('./pages/JoinPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const PricingPage = lazy(() => import('./pages/PricingPage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const HomePage = lazy(() => import('./pages/HomePage'));
const PrivacyPolicyPage = lazy(() => import('./pages/PrivacyPolicyPage'));
const TermsPage = lazy(() => import('./pages/TermsPage'));
const RefundPolicyPage = lazy(() => import('./pages/RefundPolicyPage'));
const SupportPage = lazy(() => import('./pages/SupportPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const MarketPage = lazy(() => import('./pages/MarketPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const AssistantPage = lazy(() => import('./pages/AssistantPage'));
const MealsPage = lazy(() => import('./pages/MealsPage'));
const ExpensesPage = lazy(() => import('./pages/ExpensesPage'));
const TemplatesPage = lazy(() => import('./pages/TemplatesPage'));

function RouteFallback() {
  return <div className="route-fallback-v95" role="status" aria-live="polite"><span>✦</span><strong>Preparing your workspace…</strong></div>;
}

function RequireAuth({ children }: { children: ReactElement }) {
  const token = localStorage.getItem('token');
  const location = useLocation();
  if (token) return <AppFrame>{children}</AppFrame>;
  const next = `${location.pathname}${location.search}${location.hash}`;
  return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
}

function PublicRoute({ children }: { children: ReactElement }) {
  const token = localStorage.getItem('token');
  return token ? <AppFrame>{children}</AppFrame> : <PublicFrame>{children}</PublicFrame>;
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<PublicFrame><HomePage /></PublicFrame>} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/pricing" element={<PublicRoute><PricingPage /></PublicRoute>} />
        <Route path="/about" element={<PublicRoute><AboutPage /></PublicRoute>} />
        <Route path="/privacy" element={<PublicRoute><PrivacyPolicyPage /></PublicRoute>} />
        <Route path="/terms" element={<PublicRoute><TermsPage /></PublicRoute>} />
        <Route path="/refund-policy" element={<PublicRoute><RefundPolicyPage /></PublicRoute>} />
        <Route path="/support" element={<PublicRoute><SupportPage /></PublicRoute>} />
        <Route path="/join/:token" element={<RequireAuth><JoinPage /></RequireAuth>} />
        <Route path="/houses" element={<RequireAuth><HousesPage /></RequireAuth>} />
        <Route path="/assistant" element={<RequireAuth><AssistantPage /></RequireAuth>} />
        <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
        <Route path="/reports" element={<RequireAuth><ReportsPage /></RequireAuth>} />
        <Route path="/market" element={<RequireAuth><MarketPage /></RequireAuth>} />
        <Route path="/admin" element={<RequireAuth><AdminPage /></RequireAuth>} />
        <Route path="/houses/:houseId" element={<RequireAuth><HousePage /></RequireAuth>} />
        <Route path="/houses/:houseId/inventory" element={<RequireAuth><InventoryPage /></RequireAuth>} />
        <Route path="/houses/:houseId/scan" element={<RequireAuth><ReceiptScanPage /></RequireAuth>} />
        <Route path="/houses/:houseId/shopping" element={<RequireAuth><ShoppingPage /></RequireAuth>} />
        <Route path="/houses/:houseId/meals" element={<RequireAuth><MealsPage /></RequireAuth>} />
        <Route path="/houses/:houseId/expenses" element={<RequireAuth><ExpensesPage /></RequireAuth>} />
        <Route path="/houses/:houseId/templates" element={<RequireAuth><TemplatesPage /></RequireAuth>} />
        <Route path="/houses/:houseId/receipts" element={<RequireAuth><ReceiptHistoryPage /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

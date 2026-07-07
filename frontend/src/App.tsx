import type { ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import HousesPage from './pages/HousesPage';
import HousePage from './pages/HousePage';
import ShoppingPage from './pages/ShoppingPage';
import JoinPage from './pages/JoinPage';
import ProfilePage from './pages/ProfilePage';
import PricingPage from './pages/PricingPage';
import AboutPage from './pages/AboutPage';
import HomePage from './pages/HomePage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import TermsPage from './pages/TermsPage';
import RefundPolicyPage from './pages/RefundPolicyPage';
import SupportPage from './pages/SupportPage';
import ReportsPage from './pages/ReportsPage';
import MarketPage from './pages/MarketPage';
import AdminPage from './pages/AdminPage';
import AppFrame from './components/AppFrame';
import PublicFrame from './components/PublicFrame';

function RequireAuth({ children }: { children: ReactElement }) {
  const token = localStorage.getItem('token');
  return token ? <AppFrame>{children}</AppFrame> : <Navigate to="/login" replace />;
}

function PublicRoute({ children }: { children: ReactElement }) {
  const token = localStorage.getItem('token');
  return token ? <AppFrame>{children}</AppFrame> : <PublicFrame>{children}</PublicFrame>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PublicRoute><HomePage /></PublicRoute>} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/pricing" element={<PublicRoute><PricingPage /></PublicRoute>} />
      <Route path="/about" element={<PublicRoute><AboutPage /></PublicRoute>} />
      <Route path="/privacy" element={<PublicRoute><PrivacyPolicyPage /></PublicRoute>} />
      <Route path="/terms" element={<PublicRoute><TermsPage /></PublicRoute>} />
      <Route path="/refund-policy" element={<PublicRoute><RefundPolicyPage /></PublicRoute>} />
      <Route path="/support" element={<PublicRoute><SupportPage /></PublicRoute>} />
      <Route path="/join/:token" element={<RequireAuth><JoinPage /></RequireAuth>} />
      <Route path="/houses" element={<RequireAuth><HousesPage /></RequireAuth>} />
      <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
      <Route path="/reports" element={<RequireAuth><ReportsPage /></RequireAuth>} />
      <Route path="/market" element={<RequireAuth><MarketPage /></RequireAuth>} />
      <Route path="/admin" element={<RequireAuth><AdminPage /></RequireAuth>} />
      <Route path="/houses/:houseId" element={<RequireAuth><HousePage /></RequireAuth>} />
      <Route path="/houses/:houseId/shopping" element={<RequireAuth><ShoppingPage /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

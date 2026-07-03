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
import AppFrame from './components/AppFrame';

function RequireAuth({ children }: { children: ReactElement }) {
  const token = localStorage.getItem('token');
  return token ? <AppFrame>{children}</AppFrame> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/join/:token" element={<RequireAuth><JoinPage /></RequireAuth>} />
      <Route path="/houses" element={<RequireAuth><HousesPage /></RequireAuth>} />
      <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
      <Route path="/pricing" element={<RequireAuth><PricingPage /></RequireAuth>} />
      <Route path="/about" element={<RequireAuth><AboutPage /></RequireAuth>} />
      <Route path="/houses/:houseId" element={<RequireAuth><HousePage /></RequireAuth>} />
      <Route path="/houses/:houseId/shopping" element={<RequireAuth><ShoppingPage /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/houses" replace />} />
    </Routes>
  );
}

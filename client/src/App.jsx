import { Routes, Route } from 'react-router-dom';

import AppShell from './components/layout/AppShell.jsx';
import ProtectedRoute from './components/auth/ProtectedRoute.jsx';

import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import VerifyEmail from './pages/VerifyEmail.jsx';
import AcceptGuardian from './pages/AcceptGuardian.jsx';

import Dashboard from './pages/Dashboard.jsx';
import NewTrip from './pages/NewTrip.jsx';
import TripDetail from './pages/TripDetail.jsx';
import Guardians from './pages/Guardians.jsx';
import Settings from './pages/Settings.jsx';

import Watching from './pages/Watching.jsx';
import GuardianTrip from './pages/GuardianTrip.jsx';
import NotFound from './pages/NotFound.jsx';

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/accept-guardian" element={<AcceptGuardian />} />

      {/* Signed in */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/trips/new" element={<NewTrip />} />
          <Route path="/trips/:id" element={<TripDetail />} />
          <Route path="/guardians" element={<Guardians />} />
          <Route path="/watching" element={<Watching />} />
          <Route path="/guardian/trip/:id" element={<GuardianTrip />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}

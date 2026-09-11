import "./App.css";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AuthCallback } from "./pages/AuthCallback";
import Landing from "./pages/Landing";
import { Login, Register, ForgotPassword, ResetPassword } from "./pages/Auth";
import PlayerOnboarding from "./pages/PlayerOnboarding";
import PlayerDashboard from "./pages/PlayerDashboard";
import PlayerCheckin from "./pages/PlayerCheckin";
import CoachDashboard from "./pages/CoachDashboard";
import CoachPlayerProfile from "./pages/CoachPlayerProfile";
import { Toaster } from "./components/ui/sonner";

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading || user === null) return null;
  if (!user) return <Landing />;
  return <Navigate to={user.role === "coach" ? "/coach" : "/dashboard"} replace />;
}

function AppRouter() {
  const location = useLocation();
  if (location.hash?.includes("session_id=")) return <AuthCallback />;
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/onboarding" element={<ProtectedRoute role="player"><PlayerOnboarding /></ProtectedRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute role="player"><PlayerDashboard /></ProtectedRoute>} />
      <Route path="/checkin" element={<ProtectedRoute role="player"><PlayerCheckin /></ProtectedRoute>} />
      <Route path="/coach" element={<ProtectedRoute role="coach"><CoachDashboard /></ProtectedRoute>} />
      <Route path="/coach/player/:playerId" element={<ProtectedRoute role="coach"><CoachPlayerProfile /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <AppRouter />
        </BrowserRouter>
        <Toaster />
      </AuthProvider>
    </div>
  );
}

export default App;

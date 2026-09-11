import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function Loader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="font-data text-gold text-xl animate-pulse tracking-widest">LOADING...</div>
    </div>
  );
}

export function ProtectedRoute({ children, role }) {
  const { user, loading } = useAuth();
  if (loading || user === null) return <Loader />;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) {
    return <Navigate to={user.role === "coach" ? "/coach" : "/dashboard"} replace />;
  }
  return children;
}

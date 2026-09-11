import { useAuth } from "../context/AuthContext";
import { LogOut, Shield, Crosshair } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { NotificationBell } from "./NotificationBell";

export function Layout({ children, title }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background grid-noise">
      <header className="hud-panel border-x-0 border-t-0 sticky top-0 z-40 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate(user?.role === "coach" ? "/coach" : "/dashboard")}
            className="flex items-center gap-3"
            data-testid="nav-logo"
          >
            <Crosshair className="text-gold w-7 h-7 gold-glow" />
            <div className="text-start leading-tight">
              <div className="font-data font-bold text-lg tracking-widest text-gold">YRM</div>
              <div className="text-[10px] text-muted-foreground tracking-[0.3em] font-data">COACH PORTAL</div>
            </div>
          </button>
          <div className="flex items-center gap-4">
            {user?.role === "coach" && (
              <span className="hidden sm:flex items-center gap-1.5 text-xs font-data uppercase tracking-wider text-gold border border-gold/30 px-2.5 py-1 rounded-sm">
                <Shield className="w-3.5 h-3.5" /> Coach
              </span>
            )}
            <NotificationBell />
            <span className="text-sm hidden sm:block text-foreground/80" data-testid="nav-username">{user?.name}</span>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-alert transition-colors"
              data-testid="logout-btn"
            >
              <LogOut className="w-4 h-4" /> خروج
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {title && <h1 className="text-3xl sm:text-4xl font-extrabold mb-8">{title}</h1>}
        {children}
      </main>
    </div>
  );
}

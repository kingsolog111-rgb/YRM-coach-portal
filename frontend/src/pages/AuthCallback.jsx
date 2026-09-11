import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export function AuthCallback() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;
    const hash = window.location.hash;
    const match = hash.match(/session_id=([^&]+)/);
    const sessionId = match ? match[1] : null;
    if (!sessionId) {
      navigate("/login");
      return;
    }
    (async () => {
      try {
        const { data } = await api.post("/auth/google/session", {}, { headers: { "X-Session-ID": sessionId } });
        setUser(data);
        window.history.replaceState(null, "", window.location.pathname);
        navigate(data.role === "coach" ? "/coach" : "/dashboard", { replace: true });
      } catch {
        navigate("/login");
      }
    })();
  }, [navigate, setUser]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="font-data text-gold text-xl animate-pulse tracking-widest">جاري تسجيل الدخول...</div>
    </div>
  );
}

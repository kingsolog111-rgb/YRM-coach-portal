import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api, formatApiErrorDetail } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Crosshair } from "lucide-react";

const AuthShell = ({ children }) => (
  <div className="min-h-screen bg-background grid-noise flex items-center justify-center p-4">
    <div className="w-full max-w-md">
      <Link to="/" className="flex items-center justify-center gap-3 mb-8" data-testid="auth-logo">
        <Crosshair className="text-gold w-8 h-8 gold-glow" />
        <span className="font-data font-bold text-2xl tracking-widest text-gold">YRM COACH PORTAL</span>
      </Link>
      <div className="hud-panel rounded-sm p-8">{children}</div>
    </div>
  </div>
);

const Field = ({ label, ...props }) => (
  <div className="mb-4">
    <label className="block text-sm text-foreground/70 mb-1.5">{label}</label>
    <input
      {...props}
      className="w-full bg-[#0E1117] border border-border rounded-sm px-4 py-2.5 text-foreground focus:border-gold focus:outline-none transition-colors"
    />
  </div>
);

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
const googleLogin = () => {
  const redirectUrl = window.location.origin + "/dashboard";
  window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
};

const GoogleBtn = () => (
  <button
    type="button"
    onClick={googleLogin}
    className="w-full flex items-center justify-center gap-2 border border-border rounded-sm py-2.5 text-sm hover:border-gold/50 transition-colors mt-3"
    data-testid="google-login-btn"
  >
    <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="g" className="w-5 h-5" />
    تسجيل الدخول عبر Google
  </button>
);

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { setUser } = useAuth();
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      setUser(data);
      navigate(data.role === "coach" ? "/coach" : "/dashboard", { replace: true });
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <h2 className="text-2xl font-bold mb-6">تسجيل الدخول</h2>
      {error && <div className="bg-alert/15 border border-alert/40 text-alert text-sm rounded-sm p-3 mb-4" data-testid="login-error">{error}</div>}
      <form onSubmit={submit}>
        <Field label="الايميل" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required data-testid="login-email" />
        <Field label="الباسورد" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required data-testid="login-password" />
        <div className="text-end mb-4">
          <Link to="/forgot-password" className="text-xs text-gold hover:underline" data-testid="forgot-link">نسيت الباسورد؟</Link>
        </div>
        <button type="submit" disabled={loading} className="w-full bg-gold text-background font-bold py-2.5 rounded-sm hover:brightness-110 transition-all disabled:opacity-60" data-testid="login-submit">
          {loading ? "..." : "دخول"}
        </button>
      </form>
      <GoogleBtn />
      <p className="text-center text-sm text-muted-foreground mt-6">
        ما عندك حساب؟ <Link to="/register" className="text-gold hover:underline" data-testid="to-register">سجّل الحين</Link>
      </p>
    </AuthShell>
  );
}

export function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [invite, setInvite] = useState(null);
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const inviteToken = new URLSearchParams(window.location.search).get("invite");

  useEffect(() => {
    if (inviteToken) api.get(`/auth/invite/${inviteToken}`).then(({ data }) => setInvite(data)).catch(() => {});
  }, [inviteToken]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/register", { name, email, password, invite_token: inviteToken || null });
      setUser(data);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <h2 className="text-2xl font-bold mb-6">حساب جديد</h2>
      {invite?.valid && (
        <div className="bg-gold/10 border border-gold/40 text-gold text-sm rounded-sm p-3 mb-4" data-testid="invite-banner">
          دعوة خاصة من المدرب {invite.coach_name ? `(${invite.coach_name})` : ""} — بتسجّل تحت إشرافه مباشرة.
        </div>
      )}
      {invite && !invite.valid && (
        <div className="bg-alert/15 border border-alert/40 text-alert text-sm rounded-sm p-3 mb-4" data-testid="invite-invalid">
          رابط الدعوة غير صالح أو مستخدم من قبل، بس تقدر تسجّل عادي.
        </div>
      )}
      {error && <div className="bg-alert/15 border border-alert/40 text-alert text-sm rounded-sm p-3 mb-4" data-testid="register-error">{error}</div>}
      <form onSubmit={submit}>
        <Field label="الاسم الكامل" value={name} onChange={(e) => setName(e.target.value)} required data-testid="register-name" />
        <Field label="الايميل" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required data-testid="register-email" />
        <Field label="الباسورد" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} data-testid="register-password" />
        <button type="submit" disabled={loading} className="w-full bg-gold text-background font-bold py-2.5 rounded-sm hover:brightness-110 transition-all disabled:opacity-60" data-testid="register-submit">
          {loading ? "..." : "إنشاء حساب"}
        </button>
      </form>
      <GoogleBtn />
      <p className="text-center text-sm text-muted-foreground mt-6">
        عندك حساب؟ <Link to="/login" className="text-gold hover:underline" data-testid="to-login">دخول</Link>
      </p>
    </AuthShell>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post("/auth/forgot-password", { email });
    } catch {}
    setSent(true);
  };
  return (
    <AuthShell>
      <h2 className="text-2xl font-bold mb-6">استعادة الباسورد</h2>
      {sent ? (
        <p className="text-sm text-foreground/80 mb-4" data-testid="forgot-sent">إذا كان الايميل مسجّل، راح يوصلك رابط لإعادة تعيين الباسورد.</p>
      ) : (
        <form onSubmit={submit}>
          <Field label="الايميل" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required data-testid="forgot-email" />
          <button type="submit" className="w-full bg-gold text-background font-bold py-2.5 rounded-sm hover:brightness-110 transition-all" data-testid="forgot-submit">
            إرسال الرابط
          </button>
        </form>
      )}
      <p className="text-center text-sm text-muted-foreground mt-6">
        <Link to="/login" className="text-gold hover:underline" data-testid="back-to-login">رجوع لتسجيل الدخول</Link>
      </p>
    </AuthShell>
  );
}

export function ResetPassword() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const navigate = useNavigate();
  const token = new URLSearchParams(window.location.search).get("token");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await api.post("/auth/reset-password", { token, password });
      setDone(true);
      setTimeout(() => navigate("/login"), 1500);
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail));
    }
  };
  return (
    <AuthShell>
      <h2 className="text-2xl font-bold mb-6">باسورد جديد</h2>
      {error && <div className="bg-alert/15 border border-alert/40 text-alert text-sm rounded-sm p-3 mb-4" data-testid="reset-error">{error}</div>}
      {done ? (
        <p className="text-success text-sm" data-testid="reset-done">تم تغيير الباسورد. جاري التحويل...</p>
      ) : (
        <form onSubmit={submit}>
          <Field label="الباسورد الجديد" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} data-testid="reset-password" />
          <button type="submit" className="w-full bg-gold text-background font-bold py-2.5 rounded-sm hover:brightness-110 transition-all" data-testid="reset-submit">
            حفظ
          </button>
        </form>
      )}
      <p className="text-center text-sm text-muted-foreground mt-6">
        <Link to="/login" className="text-gold hover:underline" data-testid="reset-back-login">رجوع لتسجيل الدخول</Link>
      </p>
    </AuthShell>
  );
}

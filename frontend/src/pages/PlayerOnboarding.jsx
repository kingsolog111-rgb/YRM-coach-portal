import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatApiErrorDetail } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Layout } from "../components/Layout";
import { AssessmentSliders } from "../components/AssessmentSliders";
import { ImageUpload } from "../components/ImageUpload";
import { Gauge } from "../components/Gauge";
import { ROLES, emptyAssessment, avgAssessment } from "../lib/constants";

const Field = ({ label, children }) => (
  <div>
    <label className="block text-sm text-foreground/70 mb-1.5">{label}</label>
    {children}
  </div>
);
const inputCls = "w-full bg-[#0E1117] border border-border rounded-sm px-4 py-2.5 focus:border-gold focus:outline-none transition-colors";

export default function PlayerOnboarding() {
  const { checkAuth } = useAuth();
  const navigate = useNavigate();
  const [f, setF] = useState({
    full_name: "", ign: "", uid: "", age: "", country: "", avatar_path: null,
    device: "", controls: "", gyroscope: false, fps: "", ping: "", years_playing: "", role: ROLES[0],
  });
  const [assessment, setAssessment] = useState(emptyAssessment());
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    api.get("/player/profile").then(({ data }) => {
      if (data && data.full_name) {
        setF({ ...f, ...data });
        if (data.assessment) setAssessment(data.assessment);
      }
    }).catch(() => {});
    // eslint-disable-next-line
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/player/profile", {
        ...f,
        age: Number(f.age),
        years_playing: Number(f.years_playing),
        assessment,
      });
      await checkAuth();
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout title="أنشئ ملفك الشخصي">
      {error && <div className="bg-alert/15 border border-alert/40 text-alert text-sm rounded-sm p-3 mb-6" data-testid="onboarding-error">{error}</div>}
      <form onSubmit={submit} className="space-y-8">
        <section className="hud-panel rounded-sm p-6 sm:p-8">
          <h2 className="text-lg font-bold text-gold mb-6 font-data tracking-wide">معلومات الحساب</h2>
          <div className="mb-6"><ImageUpload value={f.avatar_path} onChange={(p) => set("avatar_path", p)} label="صورة شخصية" testId="avatar-upload" round /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <Field label="الاسم الكامل"><input className={inputCls} value={f.full_name} onChange={(e) => set("full_name", e.target.value)} required data-testid="pf-full-name" /></Field>
            <Field label="Username داخل اللعبة"><input className={inputCls} value={f.ign} onChange={(e) => set("ign", e.target.value)} required data-testid="pf-ign" /></Field>
            <Field label="UID"><input className={inputCls} value={f.uid} onChange={(e) => set("uid", e.target.value)} required data-testid="pf-uid" /></Field>
            <Field label="العمر"><input type="number" className={inputCls} value={f.age} onChange={(e) => set("age", e.target.value)} required data-testid="pf-age" /></Field>
            <Field label="الدولة"><input className={inputCls} value={f.country} onChange={(e) => set("country", e.target.value)} required data-testid="pf-country" /></Field>
            <Field label="الجهاز (Device)"><input className={inputCls} value={f.device} onChange={(e) => set("device", e.target.value)} required data-testid="pf-device" /></Field>
            <Field label="نوع الـControls"><input className={inputCls} placeholder="4 Fingers / Gyro" value={f.controls} onChange={(e) => set("controls", e.target.value)} required data-testid="pf-controls" /></Field>
            <Field label="FPS"><input className={inputCls} value={f.fps} onChange={(e) => set("fps", e.target.value)} required data-testid="pf-fps" /></Field>
            <Field label="Ping"><input className={inputCls} value={f.ping} onChange={(e) => set("ping", e.target.value)} required data-testid="pf-ping" /></Field>
            <Field label="سنوات اللعب"><input type="number" step="0.5" className={inputCls} value={f.years_playing} onChange={(e) => set("years_playing", e.target.value)} required data-testid="pf-years" /></Field>
            <Field label="Role">
              <select className={inputCls} value={f.role} onChange={(e) => set("role", e.target.value)} data-testid="pf-role">
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Gyroscope">
              <label className="flex items-center gap-2 py-2.5 cursor-pointer">
                <input type="checkbox" checked={f.gyroscope} onChange={(e) => set("gyroscope", e.target.checked)} className="w-4 h-4 accent-[#E3A75C]" data-testid="pf-gyro" />
                <span className="text-sm">مفعّل</span>
              </label>
            </Field>
          </div>
        </section>

        <section className="hud-panel rounded-sm p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-6 mb-6">
            <h2 className="text-lg font-bold text-gold font-data tracking-wide">Initial Self-Assessment</h2>
            <Gauge value={avgAssessment(assessment)} size={120} label="Overall" />
          </div>
          <AssessmentSliders value={assessment} onChange={setAssessment} />
        </section>

        <button type="submit" disabled={loading} className="w-full sm:w-auto bg-gold text-background font-bold px-10 py-3 rounded-sm hover:brightness-110 transition-all disabled:opacity-60" data-testid="onboarding-submit">
          {loading ? "..." : "حفظ الملف والانتقال للـDashboard"}
        </button>
      </form>
    </Layout>
  );
}

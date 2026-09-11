import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatApiErrorDetail } from "../lib/api";
import { Layout } from "../components/Layout";
import { AssessmentSliders } from "../components/AssessmentSliders";
import { ImageUpload } from "../components/ImageUpload";
import { Gauge } from "../components/Gauge";
import { emptyAssessment, avgAssessment } from "../lib/constants";
import { Star } from "lucide-react";

const inputCls = "w-full bg-[#0E1117] border border-border rounded-sm px-4 py-2.5 focus:border-gold focus:outline-none transition-colors";

function StarRating({ value, onChange }) {
  return (
    <div className="flex gap-1.5" data-testid="star-rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} data-testid={`star-${n}`}>
          <Star className={`w-8 h-8 transition-colors ${n <= value ? "fill-gold text-gold" : "text-muted-foreground"}`} />
        </button>
      ))}
    </div>
  );
}

export default function PlayerCheckin() {
  const navigate = useNavigate();
  const [assessment, setAssessment] = useState(emptyAssessment());
  const [f, setF] = useState({
    star_rating: 3, problem_text: "", improvement_text: "",
    matches_count: "", hours_played: "", training_done: false, screenshot_path: null,
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    api.get("/player/checkin/today").then(({ data }) => {
      if (data && data.assessment) {
        setAssessment(data.assessment);
        setF({
          star_rating: data.star_rating || 3, problem_text: data.problem_text || "",
          improvement_text: data.improvement_text || "", matches_count: data.matches_count ?? "",
          hours_played: data.hours_played ?? "", training_done: !!data.training_done,
          screenshot_path: data.screenshot_path || null,
        });
      }
    }).catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/player/checkin", {
        ...f,
        matches_count: Number(f.matches_count || 0),
        hours_played: Number(f.hours_played || 0),
        assessment,
      });
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout title="Daily Check-in">
      {error && <div className="bg-alert/15 border border-alert/40 text-alert text-sm rounded-sm p-3 mb-6" data-testid="checkin-error">{error}</div>}
      <form onSubmit={submit} className="space-y-6">
        <section className="hud-panel rounded-sm p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-6 mb-6">
            <h2 className="text-lg font-bold text-gold font-data tracking-wide">تقييم نفسك اليوم</h2>
            <Gauge value={avgAssessment(assessment)} size={120} label="Overall" />
          </div>
          <AssessmentSliders value={assessment} onChange={setAssessment} />
        </section>

        <section className="hud-panel rounded-sm p-6 sm:p-8 space-y-6">
          <div>
            <label className="block text-sm text-foreground/70 mb-2">⭐ تقييم عام سريع</label>
            <StarRating value={f.star_rating} onChange={(v) => set("star_rating", v)} />
          </div>
          <div>
            <label className="block text-sm text-foreground/70 mb-1.5">شنو أكثر مشكلة واجهتك اليوم؟</label>
            <textarea className={inputCls} rows={3} value={f.problem_text} onChange={(e) => set("problem_text", e.target.value)} data-testid="checkin-problem" />
          </div>
          <div>
            <label className="block text-sm text-foreground/70 mb-1.5">شنو أكثر شي حسيت تحسنت بيه؟</label>
            <textarea className={inputCls} rows={3} value={f.improvement_text} onChange={(e) => set("improvement_text", e.target.value)} data-testid="checkin-improvement" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm text-foreground/70 mb-1.5">عدد المباريات اليوم</label>
              <input type="number" className={inputCls} value={f.matches_count} onChange={(e) => set("matches_count", e.target.value)} data-testid="checkin-matches" />
            </div>
            <div>
              <label className="block text-sm text-foreground/70 mb-1.5">عدد الساعات</label>
              <input type="number" step="0.5" className={inputCls} value={f.hours_played} onChange={(e) => set("hours_played", e.target.value)} data-testid="checkin-hours" />
            </div>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={f.training_done} onChange={(e) => set("training_done", e.target.checked)} className="w-5 h-5 accent-[#E3A75C]" data-testid="checkin-training-done" />
            <span className="text-sm">هل طبقت التدريب المطلوب؟</span>
          </label>
          <div>
            <label className="block text-sm text-foreground/70 mb-2">رفع سكرين شوت (اختياري)</label>
            <ImageUpload value={f.screenshot_path} onChange={(p) => set("screenshot_path", p)} label="رفع نتيجة ماتش" testId="checkin-screenshot" />
          </div>
        </section>

        <div className="flex gap-4">
          <button type="submit" disabled={loading} className="bg-gold text-background font-bold px-10 py-3 rounded-sm hover:brightness-110 transition-all disabled:opacity-60" data-testid="checkin-submit">
            {loading ? "..." : "حفظ Check-in"}
          </button>
          <button type="button" onClick={() => navigate("/dashboard")} className="border border-border px-8 py-3 rounded-sm hover:border-gold/40 transition-colors" data-testid="checkin-cancel">إلغاء</button>
        </div>
      </form>
    </Layout>
  );
}

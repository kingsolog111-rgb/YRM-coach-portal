import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, formatApiErrorDetail } from "../lib/api";
import { Layout } from "../components/Layout";
import { AuthImage } from "../components/AuthImage";
import { AssessmentSliders } from "../components/AssessmentSliders";
import { Gauge } from "../components/Gauge";
import { AXES, avgAssessment, emptyAssessment, ROLES } from "../lib/constants";
import { ArrowRight, Lock, MessageSquarePlus, StickyNote, Ban, Trash2, ShieldCheck } from "lucide-react";
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Legend, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { WeeklyReport } from "../components/WeeklyReport";

const TABS = [
  { key: "eval", label: "Daily Evaluation" },
  { key: "history", label: "History" },
  { key: "weekly", label: "Weekly Report" },
  { key: "media", label: "Media" },
  { key: "notes", label: "Coach Notes" },
  { key: "feedback", label: "Feedback" },
];

const box = "hud-panel rounded-sm p-6";
const inputCls = "w-full bg-[#0E1117] border border-border rounded-sm px-4 py-2.5 focus:border-gold focus:outline-none transition-colors";

function radarData(self, coach) {
  return AXES.map((a) => ({ axis: a.label, Self: self ? Number(self[a.key]) : 0, Coach: coach ? Number(coach[a.key]) : 0 }));
}

export default function CoachPlayerProfile() {
  const { playerId } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState("eval");
  const [detail, setDetail] = useState(null);

  const loadDetail = useCallback(() => api.get(`/coach/players/${playerId}`).then(({ data }) => setDetail(data)), [playerId]);
  useEffect(() => { loadDetail(); }, [loadDetail]);

  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null); // "ban" | "delete"
  const doBan = async () => { setBusy(true); try { await api.post(`/coach/players/${playerId}/ban`); await loadDetail(); } finally { setBusy(false); setConfirm(null); } };
  const doUnban = async () => { setBusy(true); try { await api.post(`/coach/players/${playerId}/unban`); await loadDetail(); } finally { setBusy(false); } };
  const doDelete = async () => { setBusy(true); try { await api.delete(`/coach/players/${playerId}`); navigate("/coach"); } finally { setBusy(false); } };

  if (!detail) return <Layout><div className="font-data text-gold animate-pulse">LOADING...</div></Layout>;
  const p = detail.profile || {};

  return (
    <Layout>
      <button onClick={() => navigate("/coach")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-gold mb-6 transition-colors" data-testid="back-to-coach">
        <ArrowRight className="w-4 h-4" /> رجوع للوحة المدرب
      </button>

      <div className={`${box} mb-6`} data-testid="player-header">
        <div className="flex flex-col sm:flex-row gap-6 items-start">
          <div className="w-24 h-24 rounded-sm overflow-hidden hud-panel shrink-0">
            <AuthImage path={p.avatar_path} className="w-full h-full object-cover" />
          </div>
          <div className="flex-1">
            <h1 className="text-3xl font-extrabold">{p.full_name || detail.name}</h1>
            <p className="text-sm text-muted-foreground font-data mb-2">{p.ign} · UID {p.uid} · {p.role}</p>
            {detail.banned && (
              <span className="inline-flex items-center gap-1.5 text-xs font-data text-alert border border-alert/40 px-2.5 py-1 rounded-sm mb-3" data-testid="banned-badge">
                <Ban className="w-3.5 h-3.5" /> الحساب موقوف
              </span>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-data text-sm mt-2">
              <Info label="Age" value={p.age} />
              <Info label="Country" value={p.country} />
              <Info label="Device" value={p.device} />
              <Info label="Controls" value={p.controls} />
              <Info label="Gyroscope" value={p.gyroscope ? "Yes" : "No"} />
              <Info label="FPS" value={p.fps} />
              <Info label="Ping" value={p.ping} />
              <Info label="Years" value={p.years_playing} />
            </div>
          </div>
          <div className="shrink-0"><Gauge value={detail.latest_self_overall} size={130} label="Overall" /></div>
        </div>
        <div className="flex flex-wrap gap-3 mt-6 pt-5 border-t border-border">
          {detail.banned ? (
            <button onClick={doUnban} disabled={busy} className="flex items-center gap-2 text-sm border border-success/50 text-success px-4 py-2 rounded-sm hover:bg-success/10 transition-colors disabled:opacity-60" data-testid="unban-player-btn">
              <ShieldCheck className="w-4 h-4" /> إلغاء الإيقاف (Unban)
            </button>
          ) : (
            <button onClick={() => setConfirm("ban")} disabled={busy} className="flex items-center gap-2 text-sm border border-alert/50 text-alert px-4 py-2 rounded-sm hover:bg-alert/10 transition-colors disabled:opacity-60" data-testid="ban-player-btn">
              <Ban className="w-4 h-4" /> إيقاف الحساب (Ban)
            </button>
          )}
          <button onClick={() => setConfirm("delete")} disabled={busy} className="flex items-center gap-2 text-sm bg-alert/90 text-white px-4 py-2 rounded-sm hover:bg-alert transition-colors disabled:opacity-60" data-testid="delete-player-btn">
            <Trash2 className="w-4 h-4" /> حذف الحساب نهائياً
          </button>
        </div>
      </div>

      <div className={`${box} mb-6`} data-testid="radar-card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gold font-data tracking-wide">7-Axes Comparison</h3>
          <div className="flex gap-4 text-xs font-data">
            <span className="text-gold">● Self ({detail.latest_self_overall ?? "-"})</span>
            <span className="text-success">● Coach ({detail.latest_coach_overall ?? "-"})</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={380}>
          <RadarChart data={radarData(detail.latest_self, detail.latest_coach)} cx="50%" cy="50%" outerRadius="68%" margin={{ top: 20, right: 60, bottom: 20, left: 60 }}>
            <PolarGrid stroke="#2a3446" />
            <PolarAngleAxis dataKey="axis" tick={{ fill: "#9CA3AF", fontSize: 10, fontFamily: "Rajdhani" }} />
            <PolarRadiusAxis domain={[0, 10]} tick={{ fill: "#4B5563", fontSize: 10 }} />
            <Radar name="Self" dataKey="Self" stroke="#E3A75C" fill="#E3A75C" fillOpacity={0.25} />
            <Radar name="Coach" dataKey="Coach" stroke="#10B981" fill="#10B981" fillOpacity={0.2} />
            <Legend wrapperStyle={{ fontSize: 12, fontFamily: "Rajdhani" }} />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap gap-2 mb-6 border-b border-border" data-testid="profile-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 font-data text-sm tracking-wide border-b-2 -mb-px transition-colors ${tab === t.key ? "border-gold text-gold" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            data-testid={`tab-${t.key}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "eval" && <EvalTab playerId={playerId} onSaved={loadDetail} />}
      {tab === "history" && <HistoryTab playerId={playerId} />}
      {tab === "weekly" && <WeeklyReport path={`/coach/players/${playerId}/weekly-report`} />}
      {tab === "media" && <MediaTab playerId={playerId} />}
      {tab === "notes" && <NotesTab playerId={playerId} />}
      {tab === "feedback" && <FeedbackTab playerId={playerId} />}

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" data-testid="confirm-modal">
          <div className="hud-panel rounded-sm p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold mb-2">{confirm === "delete" ? "حذف الحساب نهائياً؟" : "إيقاف الحساب؟"}</h3>
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
              {confirm === "delete"
                ? "راح ينحذف اللاعب وكل بياناته (Check-ins، التقييمات، الصور، الملاحظات) بشكل نهائي وما يمكن التراجع."
                : "اللاعب ما راح يقدر يسجّل دخول لين تلغي الإيقاف. بياناته تبقى محفوظة."}
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirm(null)} className="px-4 py-2 rounded-sm border border-border text-sm hover:border-gold/40 transition-colors" data-testid="confirm-cancel">إلغاء</button>
              <button onClick={confirm === "delete" ? doDelete : doBan} disabled={busy} className={`px-5 py-2 rounded-sm text-sm font-bold disabled:opacity-60 ${confirm === "delete" ? "bg-alert text-white" : "bg-gold text-background"}`} data-testid="confirm-action">
                {busy ? "..." : confirm === "delete" ? "احذف نهائياً" : "أوقف الحساب"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

const Info = ({ label, value }) => (
  <div>
    <div className="text-muted-foreground text-xs uppercase tracking-wider">{label}</div>
    <div className="font-bold">{value ?? "-"}</div>
  </div>
);

function EvalTab({ playerId, onSaved }) {
  const [dates, setDates] = useState([]);
  const [date, setDate] = useState("");
  const [checkin, setCheckin] = useState(null);
  const [evaluation, setEvaluation] = useState(emptyAssessment());
  const [note, setNote] = useState("");
  const [nextFocus, setNextFocus] = useState(AXES[0].label);
  const [gap, setGap] = useState(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.get(`/coach/players/${playerId}/checkins`).then(({ data }) => {
      setDates(data.dates);
      if (data.dates.length) setDate(data.dates[0]);
    });
  }, [playerId]);

  useEffect(() => {
    if (!date) return;
    api.get(`/coach/players/${playerId}/checkin`, { params: { date } }).then(({ data }) => {
      setCheckin(data.checkin && data.checkin.assessment ? data.checkin : null);
      if (data.evaluation && data.evaluation.assessment) {
        setEvaluation(data.evaluation.assessment);
        setNote(data.evaluation.coach_note || "");
        setNextFocus(data.evaluation.next_focus || AXES[0].label);
      } else {
        setEvaluation(emptyAssessment());
        setNote("");
      }
      setGap(data.perception_gap);
    });
  }, [date, playerId]);

  const save = async () => {
    setError(""); setMsg("");
    try {
      const { data } = await api.post(`/coach/players/${playerId}/evaluation`, {
        date, assessment: evaluation, coach_note: note, next_focus: nextFocus,
      });
      setGap(data.perception_gap);
      setMsg("تم حفظ التقييم ✓");
      onSaved && onSaved();
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  if (!dates.length) return <div className={box}><p className="text-muted-foreground text-sm">اللاعب ما سوى أي Check-in بعد.</p></div>;

  return (
    <div className="space-y-6">
      <div className={box}>
        <label className="block text-sm text-foreground/70 mb-1.5">اختر تاريخ (فيه Check-in)</label>
        <select value={date} onChange={(e) => setDate(e.target.value)} className={`${inputCls} max-w-xs`} data-testid="eval-date-select">
          {dates.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {checkin && (
        <div className={box} data-testid="player-self-eval">
          <h3 className="font-bold text-gold font-data tracking-wide mb-4">تقييم اللاعب لنفسه — {date}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-data mb-4">
            {AXES.map((a) => (
              <div key={a.key} className="bg-[#0E1117] rounded-sm p-3">
                <div className="text-xs text-muted-foreground">{a.label}</div>
                <div className="text-xl font-bold text-gold">{checkin.assessment[a.key]}</div>
              </div>
            ))}
            <div className="bg-[#0E1117] rounded-sm p-3 border border-gold/30">
              <div className="text-xs text-muted-foreground">Self Overall</div>
              <div className="text-xl font-bold text-gold">{checkin.self_overall}</div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div><span className="text-muted-foreground">المشكلة: </span>{checkin.problem_text || "-"}</div>
            <div><span className="text-muted-foreground">التحسن: </span>{checkin.improvement_text || "-"}</div>
            <div className="font-data"><span className="text-muted-foreground">Matches: </span>{checkin.matches_count} · <span className="text-muted-foreground">Hours: </span>{checkin.hours_played}</div>
            <div><span className="text-muted-foreground">Training: </span>{checkin.training_done ? "✓" : "✗"}</div>
          </div>
        </div>
      )}

      <div className={box} data-testid="coach-eval-form">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <h3 className="font-bold text-gold font-data tracking-wide">تقييم المدرب</h3>
          <Gauge value={avgAssessment(evaluation)} size={110} label="Coach" />
        </div>
        <AssessmentSliders value={evaluation} onChange={setEvaluation} />
        <div className="mt-6 space-y-4">
          <div>
            <label className="flex items-center gap-1.5 text-sm text-foreground/70 mb-1.5"><Lock className="w-3.5 h-3.5" /> Coach Note (خاص — ما يشوفه اللاعب)</label>
            <textarea className={inputCls} rows={3} value={note} onChange={(e) => setNote(e.target.value)} data-testid="coach-note-input" />
          </div>
          <div>
            <label className="block text-sm text-foreground/70 mb-1.5">التركيز بالجلسة القادمة (Current Focus)</label>
            <select value={nextFocus} onChange={(e) => setNextFocus(e.target.value)} className={`${inputCls} max-w-xs`} data-testid="next-focus-select">
              {AXES.map((a) => <option key={a.key} value={a.label}>{a.label}</option>)}
            </select>
          </div>
        </div>
        {error && <div className="text-alert text-sm mt-4" data-testid="eval-error">{error}</div>}
        {msg && <div className="text-success text-sm mt-4" data-testid="eval-msg">{msg}</div>}
        <button onClick={save} className="mt-6 bg-gold text-background font-bold px-8 py-2.5 rounded-sm hover:brightness-110 transition-all" data-testid="save-eval-btn">حفظ التقييم</button>
      </div>

      {gap && (
        <div className={box} data-testid="perception-gap">
          <h3 className="font-bold text-gold font-data tracking-wide mb-4">Perception Gap</h3>
          <div className="flex flex-wrap gap-6 mb-4 font-data">
            <div><span className="text-muted-foreground text-sm">Self Overall: </span><span className="text-xl font-bold text-gold">{gap.self_overall}</span></div>
            <div><span className="text-muted-foreground text-sm">Coach Overall: </span><span className="text-xl font-bold text-success">{gap.coach_overall}</span></div>
            <div><span className="text-muted-foreground text-sm">Difference: </span><span className={`text-xl font-bold ${gap.overall_diff >= 0 ? "text-gold" : "text-alert"}`}>{gap.overall_diff > 0 ? "+" : ""}{gap.overall_diff}</span></div>
          </div>
          {gap.alerts.length ? (
            <ul className="space-y-2">
              {gap.alerts.map((a, i) => (
                <li key={i} className="bg-alert/10 border-s-2 border-alert ps-3 py-2 text-sm" data-testid={`gap-alert-${i}`}>{a.text}</li>
              ))}
            </ul>
          ) : <p className="text-sm text-success">تقييم اللاعب متوافق مع تقييمك (ما فيه فروقات كبيرة).</p>}
        </div>
      )}
    </div>
  );
}

function HistoryTab({ playerId }) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    api.get(`/coach/players/${playerId}/history`).then(({ data }) => setRows(data.rows));
  }, [playerId]);
  return (
    <div className="space-y-6">
      <div className={box} data-testid="history-chart">
        <h3 className="font-bold text-gold font-data tracking-wide mb-4">Self vs Coach Rating</h3>
        {rows.length ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a3446" />
              <XAxis dataKey="date" stroke="#4B5563" fontSize={11} reversed />
              <YAxis domain={[0, 10]} stroke="#4B5563" fontSize={11} orientation="right" />
              <Tooltip contentStyle={{ background: "#171C26", border: "1px solid rgba(227,167,92,0.3)", fontFamily: "Rajdhani" }} />
              <Legend wrapperStyle={{ fontSize: 12, fontFamily: "Rajdhani" }} />
              <Line type="monotone" dataKey="self" name="Self" stroke="#E3A75C" strokeWidth={2.5} connectNulls />
              <Line type="monotone" dataKey="coach" name="Coach" stroke="#10B981" strokeWidth={2.5} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        ) : <p className="text-muted-foreground text-sm">لا يوجد بيانات.</p>}
      </div>
      <div className={`${box} overflow-x-auto`} data-testid="history-table">
        <table className="w-full text-sm font-data">
          <thead><tr className="border-b border-border text-muted-foreground text-xs uppercase tracking-wider">
            <th className="text-start p-3">Date</th><th className="text-start p-3">Self</th><th className="text-start p-3">Coach</th><th className="text-start p-3">Diff</th>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-border/40" data-testid={`history-row-${i}`}>
                <td className="p-3">{r.date}</td>
                <td className="p-3 text-gold font-bold">{r.self ?? "-"}</td>
                <td className="p-3 text-success font-bold">{r.coach ?? "-"}</td>
                <td className={`p-3 font-bold ${r.diff == null ? "text-muted-foreground" : r.diff >= 0 ? "text-gold" : "text-alert"}`}>{r.diff == null ? "-" : r.diff}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MediaTab({ playerId }) {
  const [media, setMedia] = useState([]);
  useEffect(() => {
    api.get(`/coach/players/${playerId}/media`).then(({ data }) => setMedia(data.media));
  }, [playerId]);
  return (
    <div className={box} data-testid="media-grid">
      {media.length ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {media.map((m, i) => (
            <div key={i} className="hud-panel rounded-sm overflow-hidden" data-testid={`media-item-${i}`}>
              <div className="aspect-square"><AuthImage path={m.path} className="w-full h-full object-cover" /></div>
              <div className="p-2 text-xs font-data text-muted-foreground flex justify-between">
                <span>{m.label}</span><span>{m.date}</span>
              </div>
            </div>
          ))}
        </div>
      ) : <p className="text-muted-foreground text-sm">لا يوجد صور مرفوعة.</p>}
    </div>
  );
}

function NotesTab({ playerId }) {
  const [notes, setNotes] = useState([]);
  const [text, setText] = useState("");
  const load = useCallback(() => api.get(`/coach/players/${playerId}/notes`).then(({ data }) => setNotes(data.notes)), [playerId]);
  useEffect(() => { load(); }, [load]);
  const add = async () => {
    if (!text.trim()) return;
    await api.post(`/coach/players/${playerId}/notes`, { note: text });
    setText(""); load();
  };
  return (
    <div className="space-y-6">
      <div className={box}>
        <div className="flex items-center gap-2 text-gold mb-3"><Lock className="w-4 h-4" /><h3 className="font-bold font-data tracking-wide">Coach Notes — خاصة، ما يشوفها اللاعب</h3></div>
        <textarea className={inputCls} rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="اكتب ملاحظة خاصة..." data-testid="note-input" />
        <button onClick={add} className="mt-3 flex items-center gap-2 bg-gold text-background font-bold px-6 py-2 rounded-sm hover:brightness-110 transition-all" data-testid="add-note-btn">
          <StickyNote className="w-4 h-4" /> إضافة ملاحظة
        </button>
      </div>
      <div className={box} data-testid="notes-list">
        {notes.length ? (
          <ul className="space-y-3">
            {notes.map((n, i) => (
              <li key={i} className="border-s-2 border-gold ps-4 py-1" data-testid={`note-item-${i}`}>
                <div className="text-xs text-muted-foreground font-data mb-1">{n.date}</div>
                <p className="text-sm">{n.note}</p>
              </li>
            ))}
          </ul>
        ) : <p className="text-muted-foreground text-sm">لا يوجد ملاحظات.</p>}
      </div>
    </div>
  );
}

function FeedbackTab({ playerId }) {
  const [items, setItems] = useState([]);
  const [dates, setDates] = useState([]);
  const [checkinDate, setCheckinDate] = useState("");
  const [text, setText] = useState("");
  const load = useCallback(() => api.get(`/coach/players/${playerId}/feedback`).then(({ data }) => setItems(data.feedback)), [playerId]);
  useEffect(() => {
    load();
    api.get(`/coach/players/${playerId}/checkins`).then(({ data }) => setDates(data.dates));
  }, [load, playerId]);
  const add = async () => {
    if (!text.trim()) return;
    await api.post(`/coach/players/${playerId}/feedback`, { feedback_text: text, checkin_date: checkinDate || null });
    setText(""); load();
  };
  return (
    <div className="space-y-6">
      <div className={box}>
        <div className="flex items-center gap-2 text-gold mb-3"><MessageSquarePlus className="w-4 h-4" /><h3 className="font-bold font-data tracking-wide">Give Feedback — ينعرض عند اللاعب</h3></div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-3">
          <div className="sm:col-span-1">
            <label className="block text-xs text-muted-foreground mb-1.5">بخصوص Check-in (اختياري)</label>
            <select value={checkinDate} onChange={(e) => setCheckinDate(e.target.value)} className={inputCls} data-testid="feedback-date-select">
              <option value="">عام</option>
              {dates.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>
        <textarea className={inputCls} rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="اكتب ردك على مشكلة اليوم أو ملاحظة توجيهية..." data-testid="feedback-input" />
        <button onClick={add} className="mt-3 bg-gold text-background font-bold px-6 py-2 rounded-sm hover:brightness-110 transition-all" data-testid="add-feedback-btn">إرسال Feedback</button>
      </div>
      <div className={box} data-testid="feedback-list">
        {items.length ? (
          <ul className="space-y-3">
            {items.map((f, i) => (
              <li key={i} className="border-s-2 border-success ps-4 py-1" data-testid={`fb-item-${i}`}>
                <div className="text-xs text-muted-foreground font-data mb-1">{f.date}{f.checkin_date ? ` · بخصوص ${f.checkin_date}` : ""}</div>
                <p className="text-sm">{f.feedback_text}</p>
              </li>
            ))}
          </ul>
        ) : <p className="text-muted-foreground text-sm">لا يوجد Feedback مرسل.</p>}
      </div>
    </div>
  );
}

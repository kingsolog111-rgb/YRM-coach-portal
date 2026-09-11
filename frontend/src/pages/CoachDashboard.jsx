import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { Layout } from "../components/Layout";
import { AuthImage } from "../components/AuthImage";
import { StatusDot } from "../components/StatusDot";
import { Users, Activity, AlertTriangle, CheckCircle2, Search, ChevronLeft, TrendingUp, TrendingDown, Link2, Copy, Check, Plus } from "lucide-react";

const StatCard = ({ icon: Icon, label, value, suffix = "", color = "#E3A75C", testId }) => (
  <div className="hud-panel rounded-sm p-6" data-testid={testId}>
    <div className="flex items-center justify-between mb-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <Icon className="w-5 h-5" style={{ color }} />
    </div>
    <div className="font-data text-4xl font-bold" style={{ color }}>{value}{suffix}</div>
  </div>
);

function InviteRow({ inv }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inv.url);
      } else {
        throw new Error("no clipboard");
      }
    } catch {
      const ta = document.createElement("textarea");
      ta.value = inv.url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch {}
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex items-center gap-2 bg-[#0E1117] rounded-sm p-2.5" data-testid="invite-row">
      <span className={`w-2 h-2 rounded-full shrink-0 ${inv.used_by ? "bg-success" : "bg-gold"}`} />
      <span className="font-data text-xs text-foreground/70 truncate flex-1" dir="ltr">{inv.url}</span>
      {inv.used_by ? (
        <span className="text-xs text-success shrink-0">استُخدم · {inv.used_by_name || ""}</span>
      ) : (
        <button onClick={copy} className="shrink-0 text-gold hover:brightness-110 transition-all" data-testid="copy-invite-btn">
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        </button>
      )}
    </div>
  );
}

function InvitesPanel() {
  const [open, setOpen] = useState(false);
  const [invites, setInvites] = useState([]);
  const [creating, setCreating] = useState(false);
  const load = () => api.get("/coach/invites").then(({ data }) => setInvites(data.invites)).catch(() => {});
  useEffect(() => { load(); }, []);
  const generate = async () => {
    setCreating(true);
    try {
      await api.post("/coach/invites", { note: "" });
      await load();
      setOpen(true);
    } finally {
      setCreating(false);
    }
  };
  const pending = invites.filter((i) => !i.used_by);
  return (
    <div className="hud-panel rounded-sm p-5 mb-6" data-testid="invites-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-gold">
          <Link2 className="w-5 h-5" />
          <h3 className="font-bold font-data tracking-wide">روابط دعوة اللاعبين</h3>
          {pending.length > 0 && <span className="font-data text-xs text-muted-foreground">({pending.length} غير مستخدم)</span>}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setOpen((o) => !o)} className="text-sm border border-border rounded-sm px-3 py-1.5 hover:border-gold/40 transition-colors" data-testid="toggle-invites-btn">
            {open ? "إخفاء" : "عرض الروابط"}
          </button>
          <button onClick={generate} disabled={creating} className="flex items-center gap-1.5 text-sm bg-gold text-background font-bold rounded-sm px-4 py-1.5 hover:brightness-110 transition-all disabled:opacity-60" data-testid="generate-invite-btn">
            <Plus className="w-4 h-4" /> {creating ? "..." : "إنشاء رابط"}
          </button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-2">أنشئ رابط دعوة خاص وأرسله للاعب — يسجّل من خلاله ويصير تحت إشرافك مباشرة.</p>
      {open && (
        <div className="mt-4 space-y-2 max-h-64 overflow-y-auto" data-testid="invites-list">
          {invites.length ? invites.map((inv) => <InviteRow key={inv.token} inv={inv} />) : (
            <p className="text-sm text-muted-foreground">لا يوجد روابط بعد. اضغط "إنشاء رابط".</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function CoachDashboard() {
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [q, setQ] = useState("");

  const load = (query = "") => api.get("/coach/dashboard", { params: query ? { q: query } : {} }).then(({ data }) => setD(data));
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const t = setTimeout(() => load(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  if (!d) return <Layout><div className="font-data text-gold animate-pulse">LOADING...</div></Layout>;
  const s = d.stats;

  return (
    <Layout title="Coach Dashboard">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={Users} label="Total Players" value={s.total_players} testId="stat-total" />
        <StatCard icon={Activity} label="Active Today" value={s.active_today} color="#10B981" testId="stat-active" />
        <StatCard icon={AlertTriangle} label="Needs Attention" value={s.needs_attention} color="#F97316" testId="stat-attention" />
        <StatCard icon={CheckCircle2} label="Training Completed" value={s.training_completed_pct} suffix="%" color="#10B981" testId="stat-training" />
      </div>

      {d.alerts?.length > 0 && (
        <div className="hud-panel rounded-sm p-5 mb-8 space-y-2" data-testid="alerts-panel">
          {d.alerts.map((a, i) => (
            <div key={i} className="text-sm text-foreground/90" data-testid={`alert-${i}`}>{a.text}</div>
          ))}
        </div>
      )}

      <InvitesPanel />

      <div className="relative mb-4 max-w-md">
        <Search className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="بحث بالاسم أو UID أو الايميل..."
          className="w-full bg-[#0E1117] border border-border rounded-sm ps-10 pe-4 py-2.5 focus:border-gold focus:outline-none transition-colors"
          data-testid="player-search"
        />
      </div>

      <div className="hud-panel rounded-sm overflow-hidden" data-testid="players-table">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground font-data text-xs uppercase tracking-wider">
                <th className="text-start p-4">اللاعب</th>
                <th className="text-start p-4">Level</th>
                <th className="text-start p-4">Progress</th>
                <th className="text-start p-4 hidden sm:table-cell">Focus</th>
                <th className="text-start p-4">Status</th>
                <th className="p-4"></th>
              </tr>
            </thead>
            <tbody>
              {d.players.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">لا يوجد لاعبين بعد.</td></tr>
              )}
              {d.players.map((p) => (
                <tr
                  key={p.player_id}
                  onClick={() => navigate(`/coach/player/${p.player_id}`)}
                  className="border-b border-border/50 hover:bg-gold/5 cursor-pointer transition-colors"
                  data-testid={`player-row-${p.player_id}`}
                >
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full overflow-hidden hud-panel shrink-0">
                        <AuthImage path={p.avatar_path} className="w-full h-full object-cover" />
                      </div>
                      <div>
                        <div className="font-semibold">{p.name}</div>
                        <div className="text-xs text-muted-foreground font-data">{p.role || "-"}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 font-data font-bold text-lg text-gold">{p.level ?? "-"}</td>
                  <td className="p-4 font-data font-bold">
                    {p.progress_delta == null ? (
                      <span className="text-muted-foreground">-</span>
                    ) : (
                      <span className={`flex items-center gap-1 ${p.progress_delta >= 0 ? "text-success" : "text-alert"}`}>
                        {p.progress_delta >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                        {p.progress_delta > 0 ? "+" : ""}{p.progress_delta}
                      </span>
                    )}
                  </td>
                  <td className="p-4 hidden sm:table-cell font-data text-foreground/80">{p.focus || "-"}</td>
                  <td className="p-4"><StatusDot status={p.status} /></td>
                  <td className="p-4 text-muted-foreground"><ChevronLeft className="w-5 h-5" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}

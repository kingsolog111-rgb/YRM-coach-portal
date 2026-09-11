import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Award, AlertTriangle, Sparkles, TrendingUp, TrendingDown, CalendarRange } from "lucide-react";

const Stat = ({ label, value, color = "#F3F4F6" }) => (
  <div className="bg-[#0E1117] rounded-sm p-3 text-center">
    <div className="font-data text-2xl font-bold" style={{ color }}>{value}</div>
    <div className="text-[11px] text-muted-foreground font-data uppercase tracking-wider mt-0.5">{label}</div>
  </div>
);

const Chip = ({ icon: Icon, label, value, color }) => (
  <div className="flex items-center gap-2 bg-[#0E1117] rounded-sm px-3 py-2 border-s-2" style={{ borderColor: color }}>
    <Icon className="w-4 h-4" style={{ color }} />
    <div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="font-data font-bold text-sm">{value}</div>
    </div>
  </div>
);

export function WeeklyReport({ path }) {
  const [r, setR] = useState(null);
  useEffect(() => { api.get(path).then(({ data }) => setR(data)).catch(() => setR({ error: true })); }, [path]);

  if (!r) return <div className="hud-panel rounded-sm p-6 font-data text-muted-foreground text-sm animate-pulse">LOADING...</div>;

  return (
    <div className="hud-panel rounded-sm p-6" data-testid="weekly-report">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2 text-gold">
          <CalendarRange className="w-5 h-5" />
          <h3 className="font-bold font-data tracking-wide">التقرير الأسبوعي</h3>
        </div>
        <span className="font-data text-xs text-muted-foreground" dir="ltr">{r.week_start} → {r.week_end}</span>
      </div>

      {!r.checkin_count ? (
        <p className="text-sm text-muted-foreground">ما فيه Check-ins هذا الأسبوع — سجّل أداءك عشان يطلع تقريرك.</p>
      ) : (
        <>
          <div className="flex items-center gap-6 mb-6">
            <div className="text-center">
              <div className="font-data text-5xl font-bold text-gold gold-glow">{r.avg_overall ?? "-"}</div>
              <div className="text-xs text-muted-foreground font-data uppercase tracking-widest mt-1">Avg Overall</div>
            </div>
            {r.delta != null && (
              <div className={`flex items-center gap-1 font-data text-lg font-bold ${r.delta >= 0 ? "text-success" : "text-alert"}`} data-testid="weekly-delta">
                {r.delta >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                {r.delta > 0 ? "+" : ""}{r.delta}
                <span className="text-xs text-muted-foreground ms-1">مقارنة بالأسبوع الماضي</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <Stat label="Check-ins" value={r.checkin_count} color="#E3A75C" />
            <Stat label="Training %" value={`${r.training_rate}%`} color="#10B981" />
            <Stat label="Hours" value={r.total_hours} />
            <Stat label="Matches" value={r.total_matches} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {r.strongest && <Chip icon={Award} label="الأقوى" value={`${r.strongest.axis} (${r.strongest.value})`} color="#10B981" />}
            {r.weakest && <Chip icon={AlertTriangle} label="يحتاج شغل" value={`${r.weakest.axis} (${r.weakest.value})`} color="#F97316" />}
            {r.most_improved && <Chip icon={Sparkles} label="أكثر تحسّن" value={`${r.most_improved.axis} (+${r.most_improved.delta})`} color="#E3A75C" />}
          </div>
        </>
      )}
    </div>
  );
}

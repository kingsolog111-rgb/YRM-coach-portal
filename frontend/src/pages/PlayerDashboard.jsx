import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Layout } from "../components/Layout";
import { Gauge } from "../components/Gauge";
import { AuthImage } from "../components/AuthImage";
import { Target, CalendarCheck, MessageSquare, ClipboardList } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { WeeklyReport } from "../components/WeeklyReport";

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="hud-panel rounded-sm p-3 text-xs font-data">
      <div className="text-muted-foreground mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: p.color }}>{p.name}: {p.value}</div>
      ))}
    </div>
  );
};

export default function PlayerDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [d, setD] = useState(null);

  useEffect(() => {
    if (user && !user.profile_completed) {
      navigate("/onboarding", { replace: true });
      return;
    }
    api.get("/player/dashboard").then(({ data }) => {
      if (!data.profile || !data.profile.full_name) {
        navigate("/onboarding", { replace: true });
        return;
      }
      setD(data);
    });
  }, [user, navigate]);

  if (!d) return <Layout><div className="font-data text-gold animate-pulse">LOADING...</div></Layout>;

  const latestOverall = d.progress?.length ? d.progress[d.progress.length - 1].self_overall : d.profile.initial_overall;

  return (
    <Layout>
      <div className="flex items-center gap-4 mb-8">
        <div className="w-16 h-16 rounded-full overflow-hidden hud-panel">
          <AuthImage path={d.profile.avatar_path} className="w-full h-full object-cover" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold">{d.profile.full_name}</h1>
          <p className="text-sm text-muted-foreground font-data">{d.profile.ign} · {d.profile.role}</p>
          {d.coach_name && <p className="text-xs text-gold font-data mt-0.5" data-testid="player-coach-name">مدربك: {d.coach_name}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="hud-panel rounded-sm p-6 flex flex-col items-center justify-center" data-testid="overall-card">
          <Gauge value={latestOverall} size={170} label="Overall" />
        </div>

        <div className="hud-panel rounded-sm p-6" data-testid="todays-training-card">
          <div className="flex items-center gap-2 text-gold mb-4"><Target className="w-5 h-5" /><h3 className="font-bold font-data tracking-wide">Today's Training</h3></div>
          <p className="text-sm text-muted-foreground mb-2">التركيز الحالي اللي حدده المدرب:</p>
          <div className="font-data text-2xl font-bold text-gold gold-glow" data-testid="current-focus">{d.current_focus || "لا يوجد بعد"}</div>
        </div>

        <div className="hud-panel rounded-sm p-6 flex flex-col" data-testid="checkin-card">
          <div className="flex items-center gap-2 text-gold mb-4"><CalendarCheck className="w-5 h-5" /><h3 className="font-bold font-data tracking-wide">Daily Check-in</h3></div>
          {d.checkin_done_today ? (
            <div className="flex-1 flex flex-col justify-center gap-1.5">
              <p className="text-success text-sm mb-1">✓ سويت Check-in اليوم</p>
              <p className="font-data text-sm text-muted-foreground">Self Overall: <span className="text-foreground font-bold">{d.today_checkin.self_overall}</span></p>
              <p className="font-data text-sm text-muted-foreground">Rating: <span className="text-gold font-bold">{"★".repeat(d.today_checkin.star_rating || 0)}</span></p>
              <p className="font-data text-sm text-muted-foreground">Matches: <span className="text-foreground font-bold">{d.today_checkin.matches_count}</span> · Hours: <span className="text-foreground font-bold">{d.today_checkin.hours_played}</span></p>
              {d.today_checkin.problem_text && <p className="text-xs text-foreground/70 line-clamp-2"><span className="text-muted-foreground">مشكلة: </span>{d.today_checkin.problem_text}</p>}
              {d.today_checkin.improvement_text && <p className="text-xs text-foreground/70 line-clamp-2"><span className="text-muted-foreground">تحسّن: </span>{d.today_checkin.improvement_text}</p>}
              <button onClick={() => navigate("/checkin")} className="mt-3 text-sm text-gold border border-gold/40 rounded-sm py-2 hover:bg-gold/10 transition-colors" data-testid="edit-checkin-btn">تعديل Check-in اليوم</button>
            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-center">
              <p className="text-sm text-muted-foreground mb-4">ما سويت Check-in اليوم بعد.</p>
              <button onClick={() => navigate("/checkin")} className="bg-gold text-background font-bold py-2.5 rounded-sm hover:brightness-110 transition-all" data-testid="start-checkin-btn">ابدأ Check-in اليوم</button>
            </div>
          )}
        </div>
      </div>

      <div className="hud-panel rounded-sm p-6 mb-6" data-testid="progress-card">
        <div className="flex items-center gap-2 text-gold mb-6"><ClipboardList className="w-5 h-5" /><h3 className="font-bold font-data tracking-wide">My Progress</h3></div>
        {d.progress?.length ? (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={d.progress} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a3446" />
              <XAxis dataKey="date" stroke="#4B5563" fontSize={11} reversed />
              <YAxis domain={[0, 10]} stroke="#4B5563" fontSize={11} orientation="right" />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12, fontFamily: "Rajdhani" }} />
              <Line type="monotone" dataKey="self_overall" name="Self" stroke="#E3A75C" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="coach_overall" name="Coach" stroke="#10B981" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-muted-foreground">لسا ما فيه بيانات كافية. سوّي Check-ins عشان يبان تطورك.</p>
        )}
      </div>

      <div className="mb-6"><WeeklyReport path="/player/weekly-report" /></div>

      <div className="hud-panel rounded-sm p-6" data-testid="feedback-card">
        <div className="flex items-center gap-2 text-gold mb-6"><MessageSquare className="w-5 h-5" /><h3 className="font-bold font-data tracking-wide">Coach Feedback</h3></div>
        {d.feedback?.length ? (
          <ul className="space-y-4">
            {d.feedback.map((f, i) => (
              <li key={i} className="border-s-2 border-gold ps-4 py-1" data-testid={`feedback-item-${i}`}>
                <div className="text-xs text-muted-foreground font-data mb-1">{f.date}{f.checkin_date ? ` · بخصوص ${f.checkin_date}` : ""}</div>
                <p className="text-sm">{f.feedback_text}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">لا يوجد Feedback من المدرب بعد.</p>
        )}
      </div>
    </Layout>
  );
}

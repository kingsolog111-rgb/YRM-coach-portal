import { useEffect, useState, useRef } from "react";
import { api } from "../lib/api";
import { Bell } from "lucide-react";

export function NotificationBell() {
  const [data, setData] = useState({ notifications: [], unread: 0 });
  const [open, setOpen] = useState(false);
  const ref = useRef();

  const load = () => api.get("/notifications").then(({ data }) => setData(data)).catch(() => {});
  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && data.unread > 0) {
      await api.post("/notifications/read-all").catch(() => {});
      setData((d) => ({ ...d, unread: 0 }));
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={toggle} className="relative text-muted-foreground hover:text-gold transition-colors" data-testid="notif-bell">
        <Bell className="w-5 h-5" />
        {data.unread > 0 && (
          <span className="absolute -top-1.5 -end-1.5 bg-alert text-white text-[10px] font-data font-bold rounded-full min-w-4 h-4 px-1 flex items-center justify-center" data-testid="notif-badge">
            {data.unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute end-0 mt-3 w-80 hud-panel rounded-sm shadow-xl z-50 max-h-96 overflow-y-auto" data-testid="notif-dropdown">
          <div className="p-3 border-b border-border font-data text-sm text-foreground font-bold tracking-wide">التنبيهات</div>
          {data.notifications.length ? (
            data.notifications.map((n, i) => (
              <div key={i} className={`p-3 border-b border-border/40 text-sm ${!n.read ? "bg-gold/5" : ""}`} data-testid={`notif-item-${i}`}>
                <div className="flex gap-2.5">
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.type === "weekly_report" ? "bg-success" : "bg-gold"}`} />
                  <div>
                    <p className="leading-relaxed">{n.text}</p>
                    <span className="text-xs text-muted-foreground font-data">{n.type === "weekly_report" ? "Weekly Report" : "Reminder"} · {n.date}</span>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="p-6 text-sm text-muted-foreground text-center">لا يوجد تنبيهات</div>
          )}
        </div>
      )}
    </div>
  );
}

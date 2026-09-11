export function Gauge({ value = 0, max = 10, size = 160, label = "Overall", color = "#E3A75C" }) {
  const pct = Math.max(0, Math.min(1, value / max));
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct);
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }} data-testid="overall-gauge">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#2a3446" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.8s ease", filter: "drop-shadow(0 0 6px rgba(227,167,92,0.5))" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-data font-bold text-gold leading-none" style={{ fontSize: size * 0.3 }}>
          {value != null ? Number(value).toFixed(1) : "-"}
        </span>
        <span className="font-data text-muted-foreground text-xs uppercase tracking-widest mt-1">{label}</span>
      </div>
    </div>
  );
}

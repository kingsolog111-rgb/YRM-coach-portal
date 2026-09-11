const COLORS = { green: "#10B981", yellow: "#E3A75C", red: "#F97316" };

export function StatusDot({ status = "green", withGlow = true }) {
  const color = COLORS[status] || COLORS.green;
  return (
    <span
      data-testid={`status-dot-${status}`}
      className="inline-block w-3 h-3 rounded-full"
      style={{ background: color, boxShadow: withGlow ? `0 0 8px ${color}` : "none" }}
    />
  );
}

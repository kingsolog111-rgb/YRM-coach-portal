import { AXES } from "../lib/constants";

export function AssessmentSliders({ value, onChange, disabled = false }) {
  const set = (key, v) => onChange({ ...value, [key]: Number(v) });
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
      {AXES.map((a) => (
        <div key={a.key} data-testid={`axis-row-${a.key}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="font-data text-sm font-semibold tracking-wide">{a.label}</span>
            <span className="font-data font-bold text-gold text-lg w-8 text-center">{value[a.key]}</span>
          </div>
          <input
            type="range"
            min="1"
            max="10"
            step="1"
            disabled={disabled}
            value={value[a.key]}
            onChange={(e) => set(a.key, e.target.value)}
            className="w-full"
            data-testid={`axis-slider-${a.key}`}
          />
        </div>
      ))}
    </div>
  );
}

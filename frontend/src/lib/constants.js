export const AXES = [
  { key: "aim", label: "Aim" },
  { key: "recoil", label: "Recoil Control" },
  { key: "movement", label: "Movement" },
  { key: "game_sense", label: "Game Sense" },
  { key: "positioning", label: "Positioning" },
  { key: "communication", label: "Communication" },
  { key: "decision_making", label: "Decision Making" },
];

export const ROLES = ["Assaulter", "IGL", "Support", "Sniper", "Entry Fragger"];

export const emptyAssessment = () =>
  AXES.reduce((acc, a) => ({ ...acc, [a.key]: 5 }), {});

export const avgAssessment = (a) => {
  const vals = AXES.map((x) => Number(a[x.key] || 0));
  return Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
};

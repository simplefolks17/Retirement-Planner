// Design tokens — every component references these. Never use raw hex values in components.
export const C = {
  bg:     "#0d1117",
  surface:"#161b22",
  border: "#21262d",
  gold:   "#d4a843",
  blue:   "#58a6ff",
  green:  "#3fb950",
  purple: "#bc8cff",
  orange: "#f78166",
  text:   "#e6edf3",
  muted:  "#8b949e",
  card:   "#0d1117",
};

// Shared style objects — apply with spread: { ...panel }
export const panel = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  padding: "18px 20px",
};

export const sectionTitle = {
  margin: "0 0 16px",
  fontSize: 13,
  fontWeight: 700,
  color: C.muted,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

export const mono = { fontFamily: "'IBM Plex Mono', monospace", fontWeight: 500 };

export const selectStyle = {
  width: "100%", background: C.surface, border: `1px solid ${C.border}`,
  borderRadius: 6, color: C.text, fontSize: 13, padding: "7px 10px",
  outline: "none", cursor: "pointer", fontFamily: "'DM Sans', system-ui, sans-serif",
  appearance: "none",
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%238b949e'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat", backgroundPosition: "calc(100% - 10px) center",
};

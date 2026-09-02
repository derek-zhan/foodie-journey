// Shared design tokens so every screen/component pulls the same palette
// and radii instead of re-declaring slightly-different hex values.
export const colors = {
  bg: "#F7F5F2",
  card: "#FFFFFF",
  cardMuted: "#F3EFE9",
  accent: "#FF6B4A",
  accentSoft: "#FFE6DE",
  text: "#1C1C1E",
  textMuted: "#6B6B70",
  textFaint: "#9A9A9E",
  border: "#EDE9E2",
  danger: "#E14B3D",
  overlay: "rgba(20, 16, 12, 0.45)",
};

export const radii = {
  sm: 10,
  md: 14,
  lg: 20,
  pill: 999,
};

export const shadow = {
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  fab: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
};

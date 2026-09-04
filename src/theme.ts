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

// Content height of the bottom tab bar, excluding the device's bottom
// safe-area inset (BottomTabBar.tsx adds that separately). Shared with
// App.tsx (to float the Ask FAB above the bar) and every tab screen (to
// pad scrollable content so it isn't hidden behind the bar).
export const TAB_BAR_HEIGHT = 64;

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

// Liquid-glass surface tokens (GlassSurface.tsx). Kept separate from
// `colors` since these are translucent overlays meant to sit on top of
// `colors.bg`/photos, not standalone opaque fills. Names are mode-neutral
// (`tint`, not `lightTint`) so a dark-mode variant can be added later as a
// parallel object instead of a rename.
export const glass = {
  tint: "rgba(255,255,255,0.55)",
  tintStrong: "rgba(255,255,255,0.75)",
  accentTint: "rgba(255,230,222,0.55)",
  border: "rgba(255,255,255,0.6)",
  sheenTop: "rgba(255,255,255,0.35)",
  sheenBottom: "rgba(255,255,255,0)",
  overlayBackdrop: "rgba(20,16,12,0.35)",
  blurIntensity: { ios: 40, android: 30 },
};

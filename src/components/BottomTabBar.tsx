import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import GlassSurface from "./GlassSurface";
import { colors, radii, TAB_BAR_HEIGHT } from "../theme";

export type TabKey = "timeline" | "map" | "me";

const TABS: { key: TabKey; icon: string; label: string }[] = [
  { key: "timeline", icon: "📖", label: "Timeline" },
  { key: "map", icon: "🗺️", label: "Map" },
  { key: "me", icon: "👤", label: "Me" },
];

type BottomTabBarProps = {
  activeTab: TabKey;
  onChange: (tab: TabKey) => void;
};

export default function BottomTabBar({ activeTab, onChange }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <GlassSurface
      variant="real"
      tone="light"
      strong
      radius={{ topLeft: radii.lg, topRight: radii.lg }}
      shadowTier="card"
      style={styles.surface}
      contentStyle={styles.content}
    >
      <View style={styles.row}>
        {TABS.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.item}
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: active }}
              onPress={() => onChange(tab.key)}
            >
              <Text style={styles.icon}>{tab.icon}</Text>
              <Text style={[styles.label, active && styles.labelActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {/* Separate spacer (rather than padding on the row above) so the
          home-indicator inset adds to the bar's height instead of eating
          into the fixed-height row - RN doesn't expand an explicit
          `height` to fit added padding, it shrinks the content instead. */}
      <View style={{ height: insets.bottom }} />
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  surface: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  content: {
    flexDirection: "column",
  },
  row: {
    flexDirection: "row",
    height: TAB_BAR_HEIGHT,
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  icon: { fontSize: 20 },
  label: { fontSize: 11, fontWeight: "600", color: colors.textMuted },
  labelActive: { color: colors.accent },
});

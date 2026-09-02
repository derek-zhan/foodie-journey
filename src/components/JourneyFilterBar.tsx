import React from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { colors, radii } from "../theme";

export type SortMode = "newest" | "oldest" | "topRated";
export type DateRangePreset = "all" | "week" | "month";

const SORT_OPTIONS: { key: SortMode; label: string }[] = [
  { key: "newest", label: "Newest" },
  { key: "oldest", label: "Oldest" },
  { key: "topRated", label: "Top rated" },
];

const DATE_RANGE_OPTIONS: { key: DateRangePreset; label: string }[] = [
  { key: "all", label: "All" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
];

const RATING_OPTIONS = [1, 2, 3, 4, 5];

interface JourneyFilterToggleProps {
  sort: SortMode;
  hasActiveFilters: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  onClearAll: () => void;
}

// Sits inline next to the screen title (see JourneyScreen's header row) - just
// the compact icon button + an inline "current sort" label + an optional
// Clear link, so it never pushes the title down or eats a full row.
export function JourneyFilterToggle({
  sort,
  hasActiveFilters,
  expanded,
  onToggleExpanded,
  onClearAll,
}: JourneyFilterToggleProps) {
  return (
    <View style={styles.toggleRow}>
      <TouchableOpacity
        style={[styles.toggleButton, hasActiveFilters && styles.toggleButtonActive]}
        onPress={onToggleExpanded}
        accessibilityLabel={expanded ? "Hide filters" : "Show filters"}
        activeOpacity={0.75}
      >
        <Text style={styles.toggleIcon}>🎛</Text>
        <Text style={[styles.toggleLabel, hasActiveFilters && styles.toggleLabelActive]}>
          {sort !== "newest" ? SORT_OPTIONS.find((o) => o.key === sort)?.label : "Filters"}
        </Text>
        {hasActiveFilters ? <View style={styles.activeDot} /> : null}
      </TouchableOpacity>
      {hasActiveFilters ? (
        <TouchableOpacity onPress={onClearAll} accessibilityLabel="Clear filters">
          <Text style={styles.clearText}>Clear</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

interface JourneyFilterPanelProps {
  availableTags: string[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  minRating: number;
  onSetMinRating: (rating: number) => void;
  dateRange: DateRangePreset;
  onSetDateRange: (range: DateRangePreset) => void;
  sort: SortMode;
  onSetSort: (sort: SortMode) => void;
}

// The actual chip rows, rendered as a full-width block below the header row
// only while JourneyFilterToggle's `expanded` state (owned by JourneyScreen) is
// true - kept as a separate component from the toggle since they live in
// different places in the layout but must share that expanded state.
export function JourneyFilterPanel({
  availableTags,
  selectedTags,
  onToggleTag,
  minRating,
  onSetMinRating,
  dateRange,
  onSetDateRange,
  sort,
  onSetSort,
}: JourneyFilterPanelProps) {
  return (
    <View style={styles.panel}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
        {SORT_OPTIONS.map(({ key, label }) => (
          <Chip key={key} label={label} selected={sort === key} onPress={() => onSetSort(key)} />
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
        {DATE_RANGE_OPTIONS.map(({ key, label }) => (
          <Chip
            key={key}
            label={label}
            selected={dateRange === key}
            onPress={() => onSetDateRange(key)}
          />
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
        {RATING_OPTIONS.map((rating) => (
          <Chip
            key={rating}
            label={`★${rating}+`}
            selected={minRating === rating}
            onPress={() => onSetMinRating(minRating === rating ? 0 : rating)}
          />
        ))}
      </ScrollView>

      {availableTags.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          {availableTags.map((tag) => (
            <Chip
              key={tag}
              label={tag}
              selected={selectedTags.includes(tag)}
              onPress={() => onToggleTag(tag)}
            />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  toggleButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.cardMuted,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  toggleButtonActive: { backgroundColor: colors.accentSoft },
  toggleIcon: { fontSize: 14 },
  toggleLabel: { fontSize: 13, fontWeight: "600", color: colors.textMuted },
  toggleLabelActive: { color: colors.accent },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
  },
  clearText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.accent,
  },
  panel: { paddingHorizontal: 20, marginTop: 8, marginBottom: 8, gap: 8 },
  chipRow: { flexGrow: 0 },
  chip: {
    backgroundColor: colors.accentSoft,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
  },
  chipSelected: { backgroundColor: colors.accent },
  chipText: { fontSize: 12, color: colors.accent, fontWeight: "600" },
  chipTextSelected: { color: "#fff" },
});

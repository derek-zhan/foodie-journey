import React, { useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
} from "react-native";
import { colors, radii } from "../theme";

export type ScanRangePreset = "3d" | "7d" | "custom";

interface ScanRangeDropdownProps {
  days: number;
  exactDate: Date | null;
  onApplyDays: (days: number) => void;
  onApplyDate: (date: Date) => void;
}

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function isSameDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Weeks-of-cells layout for a plain month grid - `null` cells pad the first
// week (before day 1) and the last (after the month's final day) so every
// row is a full 7-wide week.
function buildMonthGrid(year: number, month: number): (Date | null)[][] {
  const firstWeekday = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/**
 * Two modes, both driving JourneyScreen.runScan/runScanForDate: the 3/7-day
 * chips scan an open-ended "since N days ago" window, while the calendar
 * scopes both the scan and the displayed list to that single picked day
 * (exactDate) - distinct from JourneyFilterBar's dateRange, which only
 * filters already-scanned/saved visits for display.
 *
 * The calendar grid here is hand-built from plain Views/Touchables rather
 * than a native date-picker library - the latter would need a dev-client
 * rebuild to run under Expo Go, which is exactly the extra round-trip this
 * project is avoiding mid-iteration (see CLAUDE.md's Expo Go caveats).
 */
export default function ScanRangeDropdown({
  days,
  exactDate,
  onApplyDays,
  onApplyDate,
}: ScanRangeDropdownProps) {
  const today = new Date();
  const [open, setOpen] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [viewYear, setViewYear] = useState(
    (exactDate ?? today).getFullYear()
  );
  const [viewMonth, setViewMonth] = useState((exactDate ?? today).getMonth());

  const preset: ScanRangePreset = exactDate
    ? "custom"
    : days === 3
      ? "3d"
      : days === 7
        ? "7d"
        : "custom";
  const label =
    preset === "3d"
      ? "3 days"
      : preset === "7d"
        ? "7 days"
        : exactDate
          ? exactDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })
          : `${days} days`;

  function closeAll() {
    setOpen(false);
    setShowCalendar(false);
  }

  function selectPreset(value: number) {
    onApplyDays(value);
    closeAll();
  }

  function selectDate(date: Date) {
    onApplyDate(date);
    closeAll();
  }

  function goToMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
    if (m > 11) {
      m = 0;
      y += 1;
    }
    setViewYear(y);
    setViewMonth(m);
  }

  const atCurrentMonth =
    viewYear === today.getFullYear() && viewMonth === today.getMonth();
  const weeks = buildMonthGrid(viewYear, viewMonth);

  return (
    <>
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => setOpen(true)}
        accessibilityLabel={`Scan range: ${label}. Tap to change.`}
        activeOpacity={0.75}
      >
        <Text style={styles.triggerText}>{label}</Text>
        <Text style={styles.triggerCaret}>▾</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={closeAll}>
        <TouchableWithoutFeedback onPress={closeAll}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>
        <View style={styles.panelWrap} pointerEvents="box-none">
          <View style={styles.panel}>
            {!showCalendar ? (
              <>
                <MenuRow
                  label="3 days"
                  selected={preset === "3d"}
                  onPress={() => selectPreset(3)}
                />
                <MenuRow
                  label="7 days"
                  selected={preset === "7d"}
                  onPress={() => selectPreset(7)}
                />
                <MenuRow
                  label="📅  Pick a date"
                  selected={preset === "custom"}
                  onPress={() => setShowCalendar(true)}
                />
              </>
            ) : (
              <View>
                <View style={styles.calendarHeader}>
                  <TouchableOpacity
                    onPress={() => goToMonth(-1)}
                    accessibilityLabel="Previous month"
                    hitSlop={8}
                  >
                    <Text style={styles.calendarNav}>‹</Text>
                  </TouchableOpacity>
                  <Text style={styles.calendarTitle}>
                    {MONTH_LABELS[viewMonth]} {viewYear}
                  </Text>
                  <TouchableOpacity
                    onPress={() => goToMonth(1)}
                    disabled={atCurrentMonth}
                    accessibilityLabel="Next month"
                    hitSlop={8}
                  >
                    <Text
                      style={[styles.calendarNav, atCurrentMonth && styles.calendarNavDisabled]}
                    >
                      ›
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.weekdayRow}>
                  {WEEKDAY_LABELS.map((w, i) => (
                    <Text key={i} style={styles.weekdayLabel}>
                      {w}
                    </Text>
                  ))}
                </View>
                {weeks.map((week, wi) => (
                  <View key={wi} style={styles.weekRow}>
                    {week.map((date, di) => {
                      const disabled = !date || date > today;
                      const isSelectedDay =
                        date != null && exactDate != null && isSameDate(date, exactDate);
                      return (
                        <TouchableOpacity
                          key={di}
                          style={[styles.dayCell, isSelectedDay && styles.dayCellSelected]}
                          disabled={disabled}
                          onPress={() => date && selectDate(date)}
                        >
                          <Text
                            style={[
                              styles.dayText,
                              disabled && styles.dayTextDisabled,
                              isSelectedDay && styles.dayTextSelected,
                            ]}
                          >
                            {date ? date.getDate() : ""}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
                <TouchableOpacity
                  onPress={() => setShowCalendar(false)}
                  style={styles.backRow}
                  accessibilityLabel="Back to scan range options"
                >
                  <Text style={styles.backText}>‹ Back</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

function MenuRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.menuRow} onPress={onPress} activeOpacity={0.75}>
      <Text style={[styles.menuRowText, selected && styles.menuRowTextSelected]}>{label}</Text>
      {selected ? <Text style={styles.menuRowCheck}>✓</Text> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.cardMuted,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  triggerText: { fontSize: 12, fontWeight: "600", color: colors.textMuted },
  triggerCaret: { fontSize: 10, color: colors.textMuted },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  panelWrap: { flex: 1, paddingTop: 110, paddingHorizontal: 20, alignItems: "flex-start" },
  panel: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    paddingVertical: 8,
    paddingHorizontal: 8,
    width: 240,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: radii.md,
  },
  menuRowText: { fontSize: 14, color: colors.text },
  menuRowTextSelected: { color: colors.accent, fontWeight: "600" },
  menuRowCheck: { color: colors.accent, fontWeight: "600" },
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  calendarNav: { fontSize: 20, color: colors.accent, paddingHorizontal: 8 },
  calendarNavDisabled: { color: colors.textMuted, opacity: 0.4 },
  calendarTitle: { fontSize: 13, fontWeight: "600", color: colors.text },
  weekdayRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 2 },
  weekdayLabel: { width: 30, textAlign: "center", fontSize: 11, color: colors.textMuted },
  weekRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    marginTop: 2,
  },
  dayCell: {
    width: 30,
    height: 30,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  dayCellSelected: { backgroundColor: colors.accent },
  dayText: { fontSize: 12, color: colors.text },
  dayTextDisabled: { color: colors.textMuted, opacity: 0.35 },
  dayTextSelected: { color: "#fff", fontWeight: "600" },
  backRow: { paddingHorizontal: 10, paddingVertical: 10 },
  backText: { fontSize: 13, color: colors.accent, fontWeight: "600" },
});

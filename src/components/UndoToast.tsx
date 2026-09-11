import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import GlassSurface from "./GlassSurface";
import { colors, radii } from "../theme";

interface UndoToastProps {
  message: string;
  onUndo: () => void;
  bottom: number;
}

// No animation library involved (the improvement plan suggested reusing
// react-native-reanimated, but nothing in this codebase uses its animation
// APIs directly yet - only transitively via ReanimatedSwipeable - and this
// can't be verified on a real device tonight, so a plain conditional render
// is the safer choice over introducing a first animated-toast pattern
// untested on-device). JourneyScreen owns the ~5s auto-dismiss timer and
// mounts/unmounts this component entirely, so it needs no visibility state
// of its own.
export default function UndoToast({ message, onUndo, bottom }: UndoToastProps) {
  return (
    <View style={[styles.wrap, { bottom }]} pointerEvents="box-none">
      <GlassSurface
        variant="real"
        tone="light"
        strong
        radius={radii.pill}
        shadowTier="fab"
        style={styles.surface}
        contentStyle={styles.content}
      >
        <Text style={styles.message} numberOfLines={1}>
          {message}
        </Text>
        <TouchableOpacity onPress={onUndo} accessibilityLabel="Undo">
          <Text style={styles.undoText}>Undo</Text>
        </TouchableOpacity>
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 20, right: 20, alignItems: "center" },
  surface: { alignSelf: "stretch" },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  message: { fontSize: 14, color: colors.text, flexShrink: 1 },
  undoText: { fontSize: 14, fontWeight: "700", color: colors.accent, marginLeft: 12 },
});

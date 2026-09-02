import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { colors, radii } from "../theme";

interface Props {
  photoUri: string | null;
  placeName: string;
  rating?: number;
  caption: string;
}

const FRAME_WIDTH = 320;
const FRAME_HEIGHT = (FRAME_WIDTH * 16) / 9;

// Pure presentational IG-Story-shaped (9:16) card: full-bleed photo, a
// bottom scrim for text legibility, place name, star rating, caption.
// Rendered inside a ViewShot wrapper (StoryExportOverlay) so it doubles as
// both the on-screen preview and the thing that gets rasterized to a PNG.
export default function StoryTemplate({ photoUri, placeName, rating, caption }: Props) {
  return (
    <View style={styles.frame}>
      {photoUri ? (
        <Image
          source={{ uri: photoUri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.placeholder]} />
      )}
      <View style={styles.scrim}>
        <Text style={styles.placeName} numberOfLines={2}>
          {placeName}
        </Text>
        {rating ? (
          <Text style={styles.rating}>
            {"★".repeat(rating)}
            {"☆".repeat(5 - rating)}
          </Text>
        ) : null}
        {caption ? (
          <Text style={styles.caption} numberOfLines={4}>
            {caption}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    borderRadius: radii.lg,
    overflow: "hidden",
    backgroundColor: colors.cardMuted,
  },
  placeholder: { backgroundColor: colors.cardMuted },
  scrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 20,
    paddingTop: 40,
    backgroundColor: colors.overlay,
    gap: 6,
  },
  placeName: { fontSize: 22, fontWeight: "700", color: "#fff" },
  rating: { fontSize: 16, color: "#FFD166" },
  caption: { fontSize: 14, color: "#fff", lineHeight: 19 },
});

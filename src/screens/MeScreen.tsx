import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import GlassSurface from "../components/GlassSurface";
import type { Visit } from "../types";
import { listVisits } from "../db/visitStore";
import { colors, radii, TAB_BAR_HEIGHT } from "../theme";

interface JourneyStats {
  totalVisits: number;
  uniquePlaces: number;
  averageRating: number | null;
  topTags: { tag: string; count: number }[];
}

function computeStats(visits: Visit[]): JourneyStats {
  const uniquePlaces = new Set(visits.map((v) => v.place.placeId)).size;

  const ratings = visits.map((v) => v.rating).filter((r): r is number => typeof r === "number");
  const averageRating =
    ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;

  const tagCounts = new Map<string, number>();
  for (const visit of visits) {
    for (const tag of visit.tags ?? []) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag, count]) => ({ tag, count }));

  return { totalVisits: visits.length, uniquePlaces, averageRating, topTags };
}

type MeScreenProps = {
  // App.tsx keeps every tab mounted, so this can mount before initDb()
  // has run - refetch once the tab is actually opened (see MapScreen.tsx
  // for the same fix on the Map tab).
  active: boolean;
};

export default function MeScreen({ active }: MeScreenProps) {
  const insets = useSafeAreaInsets();
  const [visits, setVisits] = useState<Visit[]>(() => listVisits());

  useEffect(() => {
    if (active) setVisits(listVisits());
  }, [active]);

  const stats = useMemo(() => computeStats(visits), [visits]);

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 96, paddingBottom: TAB_BAR_HEIGHT + 40 },
        ]}
      >
        <View style={styles.statRow}>
          <GlassSurface
            variant="tint"
            tone="light"
            radius={radii.lg}
            shadowTier="card"
            style={styles.statTile}
            contentStyle={styles.statTileContent}
          >
            <Text style={styles.statValue}>{stats.totalVisits}</Text>
            <Text style={styles.statLabel}>Visits</Text>
          </GlassSurface>
          <GlassSurface
            variant="tint"
            tone="light"
            radius={radii.lg}
            shadowTier="card"
            style={styles.statTile}
            contentStyle={styles.statTileContent}
          >
            <Text style={styles.statValue}>{stats.uniquePlaces}</Text>
            <Text style={styles.statLabel}>Places</Text>
          </GlassSurface>
          <GlassSurface
            variant="tint"
            tone="light"
            radius={radii.lg}
            shadowTier="card"
            style={styles.statTile}
            contentStyle={styles.statTileContent}
          >
            <Text style={styles.statValue}>
              {stats.averageRating !== null ? stats.averageRating.toFixed(1) : "—"}
            </Text>
            <Text style={styles.statLabel}>Avg rating</Text>
          </GlassSurface>
        </View>

        <GlassSurface
          variant="tint"
          tone="light"
          radius={radii.lg}
          shadowTier="card"
          style={styles.section}
          contentStyle={styles.sectionContent}
        >
          <Text style={styles.sectionTitle}>Top tags</Text>
          {stats.topTags.length === 0 ? (
            <Text style={styles.emptyText}>Journal a visit to start collecting tags.</Text>
          ) : (
            stats.topTags.map(({ tag, count }) => (
              <View key={tag} style={styles.tagRow}>
                <Text style={styles.tagName}>{tag}</Text>
                <Text style={styles.tagCount}>{count}</Text>
              </View>
            ))
          )}
        </GlassSurface>
      </ScrollView>
      <GlassSurface
        variant="real"
        tone="light"
        strong
        shadowTier="none"
        radius={0}
        style={styles.chromeSurface}
        contentStyle={[styles.chromeContent, { paddingTop: insets.top + 16 }]}
      >
        <Text style={styles.header}>Me</Text>
        <Text style={styles.subheader}>Your food journey, at a glance</Text>
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, gap: 16 },
  chromeSurface: { position: "absolute", top: 0, left: 0, right: 0 },
  chromeContent: { paddingHorizontal: 20, paddingBottom: 16 },
  header: { fontSize: 30, fontWeight: "700", color: colors.text },
  subheader: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  statRow: { flexDirection: "row", gap: 12 },
  statTile: { flex: 1 },
  statTileContent: { paddingVertical: 18, alignItems: "center", gap: 4 },
  statValue: { fontSize: 24, fontWeight: "700", color: colors.text },
  statLabel: { fontSize: 12, color: colors.textMuted },
  section: {},
  sectionContent: { padding: 16, gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  tagRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  tagName: { fontSize: 14, color: colors.text, textTransform: "capitalize" },
  tagCount: { fontSize: 14, color: colors.textMuted },
  emptyText: { fontSize: 13, color: colors.textMuted },
});

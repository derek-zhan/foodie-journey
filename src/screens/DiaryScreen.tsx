import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  SectionList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import type { Visit } from "../types";
import { listVisits, upsertScannedVisit } from "../db/visitStore";
import { extractPhotoMetadata } from "../pipeline/extractPhotoMetadata";
import { clusterVisits } from "../pipeline/clusterVisits";
import { useAssetThumbnails } from "../hooks/useAssetThumbnails";
import JournalForm from "../components/JournalForm";
import RestaurantPicker from "../components/RestaurantPicker";
import { colors, radii, shadow } from "../theme";

// Visits arrive pre-sorted newest-first (listVisits() orders by startedAt
// DESC), so grouping same-day visits just means folding consecutive runs
// that share a title - no separate sort/group-by-key pass needed.
function sectionTitle(timestamp: number): string {
  const d = new Date(timestamp);
  if (d.toDateString() === new Date().toDateString()) {
    return `TODAY · ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  }
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function groupByDate(visits: Visit[]): { title: string; data: Visit[] }[] {
  const sections: { title: string; data: Visit[] }[] = [];
  for (const visit of visits) {
    const title = sectionTitle(visit.startedAt);
    const current = sections[sections.length - 1];
    if (current && current.title === title) {
      current.data.push(visit);
    } else {
      sections.push({ title, data: [visit] });
    }
  }
  return sections;
}

export default function DiaryScreen() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(false);
  const thumbnails = useAssetThumbnails(visits);
  const sections = useMemo(() => groupByDate(visits), [visits]);

  useEffect(() => {
    runScan();
  }, []);

  async function runScan() {
    setLoading(true);
    try {
      const since = new Date();
      since.setDate(since.getDate() - 7); // last 7 days for now
      since.setHours(0, 0, 0, 0); // stable across repeated scans in the same day - see extractPhotoMetadata.ts's anchor comment

      const photos = await extractPhotoMetadata(since);
      const detected = await clusterVisits(photos);

      detected.forEach(upsertScannedVisit);
      setVisits(listVisits());
    } catch (err: any) {
      Alert.alert("Scan failed", err.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerBlock}>
        <Text style={styles.header}>Foodie Journey</Text>
        <Text style={styles.subheader}>Your recent food adventures</Text>
      </View>
      <SectionList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        sections={sections}
        keyExtractor={(v) => v.id}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={runScan}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        renderItem={({ item }) => (
          <View style={[styles.card, shadow.card]}>
            <RestaurantPicker
              visit={item}
              onSaved={() => setVisits(listVisits())}
            />
            <Text style={styles.meta}>
              {item.photoIds.length} photo
              {item.photoIds.length === 1 ? "" : "s"}
            </Text>
            {item.photoIds.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.thumbRow}
              >
                {item.photoIds.map((id) =>
                  thumbnails[id] ? (
                    <Image
                      key={id}
                      source={{ uri: thumbnails[id]! }}
                      style={styles.thumb}
                    />
                  ) : null
                )}
              </ScrollView>
            ) : null}

            {item.notes ? <Text style={styles.notes}>{item.notes}</Text> : null}
            {item.tags?.length ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.tagRow}
              >
                {item.tags.map((tag) => (
                  <View key={tag} style={styles.tagPill}>
                    <Text style={styles.tagText}>{tag}</Text>
                  </View>
                ))}
              </ScrollView>
            ) : null}

            <View style={styles.journalSlot}>
              <JournalForm
                visit={item}
                onSaved={() => setVisits(listVisits())}
              />
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🍜</Text>
            <Text style={styles.emptyText}>
              No visits yet — pull down to scan your photo library.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60, backgroundColor: colors.bg },
  headerBlock: { paddingHorizontal: 20, marginBottom: 4 },
  header: { fontSize: 30, fontWeight: "700", color: colors.text },
  subheader: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  list: { marginTop: 12 },
  listContent: { paddingHorizontal: 20, paddingBottom: 100 },
  card: {
    padding: 16,
    borderRadius: radii.lg,
    backgroundColor: colors.card,
    marginBottom: 14,
    gap: 4,
  },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  notes: { fontSize: 14, color: colors.text, marginTop: 4, lineHeight: 20 },
  sectionHeader: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginTop: 18,
    marginBottom: 10,
  },
  tagRow: { marginTop: 6 },
  tagPill: {
    backgroundColor: colors.accentSoft,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 6,
  },
  tagText: { fontSize: 12, color: colors.accent, fontWeight: "600" },
  thumbRow: { marginTop: 10 },
  thumb: {
    width: 70,
    height: 70,
    borderRadius: radii.sm,
    marginRight: 8,
    backgroundColor: colors.cardMuted,
  },
  journalSlot: { marginTop: 6 },
  empty: { alignItems: "center", paddingTop: 60, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { textAlign: "center", color: colors.textMuted, fontSize: 15, lineHeight: 22 },
});

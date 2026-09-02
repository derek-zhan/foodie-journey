import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  SectionList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Alert,
  TouchableOpacity,
  Linking,
} from "react-native";
import { Image } from "expo-image";
import type { Visit } from "../types";
import { listVisits, upsertScannedVisit, updatePhotoCaptions } from "../db/visitStore";
import { extractPhotoMetadata } from "../pipeline/extractPhotoMetadata";
import { clusterVisits } from "../pipeline/clusterVisits";
import { buildReviewLinks } from "../pipeline/reviewLinks";
import { useAssetThumbnails } from "../hooks/useAssetThumbnails";
import JournalForm from "../components/JournalForm";
import RestaurantPicker from "../components/RestaurantPicker";
import BrandIcon from "../components/BrandIcon";
import PhotoCaptionOverlay from "../components/PhotoCaptionOverlay";
import StoryExportOverlay from "../components/StoryExportOverlay";
import {
  JourneyFilterToggle,
  JourneyFilterPanel,
  type SortMode,
  type DateRangePreset,
} from "../components/JourneyFilterBar";
import { colors, radii, shadow } from "../theme";

// OpenTable has no mark in the Simple Icons set BrandIcon draws from, so it
// gets a plain badge (in its own brand red) instead of an invented logo.
const OPENTABLE_RED = "#DA3743";

const REVIEW_LINKS: { key: keyof ReturnType<typeof buildReviewLinks>; label: string }[] = [
  { key: "google", label: "Google" },
  { key: "yelp", label: "Yelp" },
  { key: "opentable", label: "OpenTable" },
];

// Visits arrive pre-sorted newest-first (listVisits() orders by startedAt
// DESC), so grouping same-day visits just means folding consecutive runs
// that share a title - no separate sort/group-by-key pass needed.
//
// Precondition: the input must already be sorted by date (ascending or
// descending, either works) so same-day visits are adjacent. Holds for
// the newest/oldest sort modes below; does NOT hold for topRated
// (dates are scattered), so that mode skips this function entirely and
// renders a single flat section instead - see `sections` in JourneyScreen.
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

interface JourneyFilterState {
  tags: string[];
  minRating: number; // 0 = no filter
  dateRange: DateRangePreset;
  sort: SortMode;
}

const DEFAULT_FILTER_STATE: JourneyFilterState = {
  tags: [],
  minRating: 0,
  dateRange: "all",
  sort: "newest",
};

const DATE_RANGE_MS: Record<Exclude<DateRangePreset, "all">, number> = {
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
};

function applyFilters(visits: Visit[], filter: JourneyFilterState): Visit[] {
  const cutoff =
    filter.dateRange === "all" ? null : Date.now() - DATE_RANGE_MS[filter.dateRange];

  const filtered = visits.filter((v) => {
    if (cutoff !== null && v.startedAt < cutoff) return false;
    if (filter.minRating > 0 && (v.rating ?? 0) < filter.minRating) return false;
    if (filter.tags.length > 0 && !filter.tags.some((t) => v.tags?.includes(t))) {
      return false;
    }
    return true;
  });

  if (filter.sort === "topRated") {
    return [...filtered].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  }
  if (filter.sort === "oldest") {
    return [...filtered].sort((a, b) => a.startedAt - b.startedAt);
  }
  return filtered; // already newest-first from listVisits()
}

export default function JourneyScreen() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(false);
  const [captionVisitId, setCaptionVisitId] = useState<string | null>(null);
  const [storyVisitId, setStoryVisitId] = useState<string | null>(null);
  const [filter, setFilter] = useState<JourneyFilterState>(DEFAULT_FILTER_STATE);
  const [filterExpanded, setFilterExpanded] = useState(false);
  const thumbnails = useAssetThumbnails(visits);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    visits.forEach((v) => v.tags?.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [visits]);

  const filteredVisits = useMemo(() => applyFilters(visits, filter), [visits, filter]);

  // An empty sections array (not a section with empty data) is required for
  // SectionList's ListEmptyComponent to actually render - a section object
  // still occupies a header slot even when its `data` is [], which silently
  // suppresses the empty state.
  const sections = useMemo(() => {
    if (filteredVisits.length === 0) return [];
    return filter.sort === "topRated"
      ? [{ title: "", data: filteredVisits }]
      : groupByDate(filteredVisits);
  }, [filteredVisits, filter.sort]);

  const hasActiveFilters =
    filter.tags.length > 0 || filter.minRating > 0 || filter.dateRange !== "all";

  function toggleTag(tag: string) {
    setFilter((f) => ({
      ...f,
      tags: f.tags.includes(tag) ? f.tags.filter((t) => t !== tag) : [...f.tags, tag],
    }));
  }

  const captionVisit = visits.find((v) => v.id === captionVisitId) ?? null;
  const storyVisit = visits.find((v) => v.id === storyVisitId) ?? null;

  function saveCaptions(visitId: string, captions: Record<string, string>) {
    updatePhotoCaptions(visitId, captions);
    setVisits(listVisits());
  }

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
        <View style={styles.headerTitleRow}>
          <View style={styles.headerTextBlock}>
            <Text style={styles.header}>Foodie Journey</Text>
            <Text style={styles.subheader}>Your recent food adventures</Text>
          </View>
          <JourneyFilterToggle
            sort={filter.sort}
            hasActiveFilters={hasActiveFilters}
            expanded={filterExpanded}
            onToggleExpanded={() => setFilterExpanded((e) => !e)}
            onClearAll={() => setFilter(DEFAULT_FILTER_STATE)}
          />
        </View>
      </View>
      {filterExpanded ? (
        <JourneyFilterPanel
          availableTags={allTags}
          selectedTags={filter.tags}
          onToggleTag={toggleTag}
          minRating={filter.minRating}
          onSetMinRating={(minRating) => setFilter((f) => ({ ...f, minRating }))}
          dateRange={filter.dateRange}
          onSetDateRange={(dateRange) => setFilter((f) => ({ ...f, dateRange }))}
          sort={filter.sort}
          onSetSort={(sort) => setFilter((f) => ({ ...f, sort }))}
        />
      ) : null}
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
        renderSectionHeader={({ section }) =>
          section.title ? <Text style={styles.sectionHeader}>{section.title}</Text> : null
        }
        renderItem={({ item }) => (
          <View style={[styles.card, shadow.card]}>
            <RestaurantPicker
              visit={item}
              onSaved={() => setVisits(listVisits())}
            />
            <View style={styles.metaRow}>
              <Text style={styles.meta}>
                {item.photoIds.length} photo
                {item.photoIds.length === 1 ? "" : "s"}
              </Text>
              <View style={styles.reviewLinkRow}>
                {REVIEW_LINKS.map(({ key, label }) => (
                  <TouchableOpacity
                    key={key}
                    style={styles.reviewLinkIcon}
                    accessibilityLabel={`Find ${item.place.name} on ${label}`}
                    onPress={() => Linking.openURL(buildReviewLinks(item.place)[key])}
                  >
                    {key === "opentable" ? (
                      <Text style={styles.opentableBadgeText}>OT</Text>
                    ) : (
                      <BrandIcon brand={key} size={14} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            {item.photoIds.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.thumbRow}
              >
                {item.photoIds.map((id) =>
                  thumbnails[id] ? (
                    <TouchableOpacity
                      key={id}
                      style={styles.thumbWrap}
                      onPress={() => setCaptionVisitId(item.id)}
                    >
                      <Image
                        source={{ uri: thumbnails[id]! }}
                        style={styles.thumb}
                      />
                      {item.photoCaptions?.[id] ? (
                        <View style={styles.captionBadge}>
                          <Text style={styles.captionBadgeText}>✓</Text>
                        </View>
                      ) : null}
                    </TouchableOpacity>
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
              <View style={styles.journalFormSlot}>
                <JournalForm
                  visit={item}
                  onSaved={() => setVisits(listVisits())}
                />
              </View>
              {item.photoIds.some((id) => thumbnails[id]) ? (
                <TouchableOpacity
                  style={styles.storyButton}
                  accessibilityLabel={`Create an Instagram story for ${item.place.name}`}
                  onPress={() => setStoryVisitId(item.id)}
                >
                  <BrandIcon brand="instagram" size={18} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        )}
        ListEmptyComponent={
          visits.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🍜</Text>
              <Text style={styles.emptyText}>
                No visits yet — pull down to scan your photo library.
              </Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🔍</Text>
              <Text style={styles.emptyText}>No visits match your filters.</Text>
              <TouchableOpacity
                onPress={() => setFilter(DEFAULT_FILTER_STATE)}
                accessibilityLabel="Clear filters"
              >
                <Text style={styles.emptyAction}>Clear filters</Text>
              </TouchableOpacity>
            </View>
          )
        }
      />
      <PhotoCaptionOverlay
        visit={captionVisit}
        thumbnails={thumbnails}
        onClose={() => setCaptionVisitId(null)}
        onSave={saveCaptions}
      />
      <StoryExportOverlay
        visit={storyVisit}
        thumbnails={thumbnails}
        onClose={() => setStoryVisitId(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60, backgroundColor: colors.bg },
  headerBlock: { paddingHorizontal: 20, marginBottom: 4 },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  headerTextBlock: { flexShrink: 1 },
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
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  meta: { fontSize: 13, color: colors.textMuted },
  reviewLinkRow: { flexDirection: "row", gap: 8 },
  reviewLinkIcon: {
    width: 26,
    height: 26,
    borderRadius: radii.pill,
    backgroundColor: colors.cardMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  opentableBadgeText: { fontSize: 9, fontWeight: "700", color: OPENTABLE_RED },
  storyButton: {
    width: 46,
    height: 46,
    borderRadius: radii.pill,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
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
  thumbWrap: { marginRight: 8 },
  thumb: {
    width: 70,
    height: 70,
    borderRadius: radii.sm,
    backgroundColor: colors.cardMuted,
  },
  captionBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  captionBadgeText: { fontSize: 11, fontWeight: "700", color: "#fff" },
  journalSlot: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 6 },
  journalFormSlot: { flex: 1 },
  empty: { alignItems: "center", paddingTop: 60, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { textAlign: "center", color: colors.textMuted, fontSize: 15, lineHeight: 22 },
  emptyAction: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: "700",
    color: colors.accent,
  },
});

import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import GlassSurface from "../components/GlassSurface";
import type { Visit } from "../types";
import { listVisits } from "../db/visitStore";
import { colors, radii } from "../theme";

type MapScreenProps = {
  // App.tsx keeps every tab mounted, so this can mount before initDb()
  // has run - refetch once the tab is actually opened (see MapScreen.tsx
  // for the native counterpart of this same fix).
  active: boolean;
};

// react-native-maps has no web implementation, so the web build (npm run
// web) gets this plain list instead - Metro picks this file over
// MapScreen.tsx automatically for web via the .web.tsx extension.
export default function MapScreen({ active }: MapScreenProps) {
  const insets = useSafeAreaInsets();
  const [visits, setVisits] = useState<Visit[]>(() => listVisits());

  useEffect(() => {
    if (active) setVisits(listVisits());
  }, [active]);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 96 }]}>
        {visits.length === 0 ? (
          <Text style={styles.emptyText}>No visits yet.</Text>
        ) : (
          visits.map((visit) => (
            <GlassSurface
              key={visit.id}
              variant="tint"
              tone="light"
              radius={radii.lg}
              shadowTier="card"
              style={styles.card}
              contentStyle={styles.cardContent}
            >
              <Text style={styles.placeName}>{visit.place.name}</Text>
              <Text style={styles.placeAddress}>{visit.place.address}</Text>
            </GlassSurface>
          ))
        )}
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
        <Text style={styles.header}>Map</Text>
        <Text style={styles.subheader}>
          Interactive maps aren't available on web yet - here's the list instead.
        </Text>
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingBottom: 100, gap: 12 },
  chromeSurface: { position: "absolute", top: 0, left: 0, right: 0 },
  chromeContent: { paddingHorizontal: 20, paddingBottom: 16 },
  header: { fontSize: 30, fontWeight: "700", color: colors.text },
  subheader: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  card: { marginBottom: 0 },
  cardContent: { padding: 16, gap: 4 },
  placeName: { fontSize: 16, fontWeight: "700", color: colors.text },
  placeAddress: { fontSize: 13, color: colors.textMuted },
  emptyText: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
});

import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MapView, { Callout, Marker } from "react-native-maps";
import GlassSurface from "../components/GlassSurface";
import type { Visit } from "../types";
import { listVisits } from "../db/visitStore";
import { colors } from "../theme";

// Fallback region (roughly continental-US zoom) when there are no visits
// yet to center on.
const DEFAULT_REGION = {
  latitude: 39.5,
  longitude: -98.35,
  latitudeDelta: 40,
  longitudeDelta: 40,
};

// How many of the most-recent visits to frame the initial view around -
// zooming to fit every visit ever recorded (which can span cities/
// countries) makes the map open too far out to be useful.
const RECENT_VISITS_FOR_REGION = 5;

function regionFromVisits(visits: Visit[]) {
  if (visits.length === 0) return DEFAULT_REGION;

  // listVisits() returns newest-first, so this is the most recent slice.
  const recent = visits.slice(0, RECENT_VISITS_FOR_REGION);
  const lats = recent.map((v) => v.place.latitude);
  const lngs = recent.map((v) => v.place.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    // Pad the span so single/clustered visits aren't zoomed in edge-to-edge,
    // with a floor that keeps a single recent visit at a comfortable
    // neighborhood-level zoom instead of a jarring close-up.
    latitudeDelta: Math.max(maxLat - minLat, 0.05) * 1.6,
    longitudeDelta: Math.max(maxLng - minLng, 0.05) * 1.6,
  };
}

type MapScreenProps = {
  // App.tsx keeps every tab mounted (so switching tabs doesn't reset
  // JourneyScreen's state - see App.tsx), but that means this component
  // can mount before initDb() has run. Refetching whenever the tab
  // actually becomes active avoids reading the DB too early and also
  // picks up visits added/edited while on another tab.
  active: boolean;
};

export default function MapScreen({ active }: MapScreenProps) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const [visits, setVisits] = useState<Visit[]>(() => listVisits());

  useEffect(() => {
    if (!active) return;
    const fresh = listVisits();
    setVisits(fresh);
    // initialRegion only takes effect on MapView's first mount, so if this
    // component mounted before initDb() finished (see MapScreenProps
    // comment) the camera needs an explicit nudge once real data shows up.
    mapRef.current?.animateToRegion(regionFromVisits(fresh), 400);
  }, [active]);

  // Only the initial camera framing uses the recent-visits heuristic -
  // every visit still gets a marker below.
  const initialRegion = useMemo(() => regionFromVisits(visits), [visits]);

  return (
    <View style={styles.container}>
      <MapView ref={mapRef} style={StyleSheet.absoluteFill} initialRegion={initialRegion}>
        {visits.map((visit) => (
          <Marker
            key={visit.id}
            coordinate={{
              latitude: visit.place.latitude,
              longitude: visit.place.longitude,
            }}
          >
            <Callout>
              <View style={styles.callout}>
                <Text style={styles.calloutTitle}>{visit.place.name}</Text>
                <Text style={styles.calloutSubtitle}>
                  {new Date(visit.startedAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                  {visit.rating ? ` · ${"★".repeat(visit.rating)}` : ""}
                </Text>
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>
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
        <Text style={styles.subheader}>Everywhere you've eaten</Text>
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  chromeSurface: { position: "absolute", top: 0, left: 0, right: 0 },
  chromeContent: { paddingHorizontal: 20, paddingBottom: 16 },
  header: { fontSize: 30, fontWeight: "700", color: colors.text },
  subheader: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  callout: { minWidth: 140, padding: 4, gap: 2 },
  calloutTitle: { fontWeight: "700", color: colors.text },
  calloutSubtitle: { fontSize: 12, color: colors.textMuted },
});

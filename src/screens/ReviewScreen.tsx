import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  ScrollView,
  StyleSheet,
  Button,
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
import { startOfToday, isToday } from "../pipeline/todayWindow";

export default function ReviewScreen() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(false);
  const thumbnails = useAssetThumbnails(visits);

  async function refresh() {
    setLoading(true);
    try {
      const photos = await extractPhotoMetadata(startOfToday());
      const detected = await clusterVisits(photos);
      detected.forEach(upsertScannedVisit);
      setVisits(listVisits().filter((v) => isToday(v.startedAt)));
    } catch (err: any) {
      Alert.alert("Scan failed", err.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Today's Review</Text>
      <Button
        title={loading ? "Scanning…" : "Refresh"}
        onPress={refresh}
        disabled={loading}
      />
      <FlatList
        style={styles.list}
        data={visits}
        keyExtractor={(v) => v.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <RestaurantPicker
              visit={item}
              onSaved={() =>
                setVisits(listVisits().filter((v) => isToday(v.startedAt)))
              }
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

            {item.notes ? <Text>{item.notes}</Text> : null}
            {item.tags?.length ? (
              <Text style={styles.tags}>{item.tags.join(" · ")}</Text>
            ) : null}

            <JournalForm
              visit={item}
              onSaved={() =>
                setVisits(listVisits().filter((v) => isToday(v.startedAt)))
              }
            />
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            No restaurants detected today yet — take some photos and refresh.
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 16, paddingHorizontal: 16 },
  header: { fontSize: 22, fontWeight: "600", marginBottom: 12 },
  list: { marginTop: 16 },
  card: {
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#f2f2f2",
    marginBottom: 10,
  },
  meta: { fontSize: 13, color: "#666", marginTop: 2 },
  tags: { fontSize: 12, color: "#888", marginTop: 4 },
  thumbRow: { marginTop: 8 },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 8,
    marginRight: 8,
    backgroundColor: "#e0e0e0",
  },
  empty: { textAlign: "center", color: "#888", marginTop: 40 },
});

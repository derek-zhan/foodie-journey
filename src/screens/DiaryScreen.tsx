import React, { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, Button, Alert } from "react-native";
import type { Visit } from "../types";
import { initDb, listVisits, upsertVisit } from "../db/visitStore";
import { extractPhotoMetadata } from "../pipeline/extractPhotoMetadata";
import { clusterVisits } from "../pipeline/clusterVisits";

export default function DiaryScreen() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    initDb();
    setVisits(listVisits());
  }, []);

  async function runScan() {
    setLoading(true);
    try {
      const since = new Date();
      since.setDate(since.getDate() - 7); // last 7 days for now

      const photos = await extractPhotoMetadata(since);
      const detected = await clusterVisits(photos);

      detected.forEach(upsertVisit);
      setVisits(listVisits());
    } catch (err: any) {
      Alert.alert("Scan failed", err.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Restaurant diary</Text>
      <Button
        title={loading ? "Scanning…" : "Scan recent photos"}
        onPress={runScan}
        disabled={loading}
      />
      <FlatList
        style={styles.list}
        data={visits}
        keyExtractor={(v) => v.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.place}>{item.place.name}</Text>
            <Text style={styles.meta}>
              {new Date(item.startedAt).toLocaleDateString()} ·{" "}
              {item.photoIds.length} photo
              {item.photoIds.length === 1 ? "" : "s"}
            </Text>
            {item.notes ? <Text>{item.notes}</Text> : null}
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            No visits yet — tap "Scan recent photos" to detect restaurants
            from your photo library.
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60, paddingHorizontal: 16 },
  header: { fontSize: 22, fontWeight: "600", marginBottom: 12 },
  list: { marginTop: 16 },
  card: {
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#f2f2f2",
    marginBottom: 10,
  },
  place: { fontSize: 16, fontWeight: "600" },
  meta: { fontSize: 13, color: "#666", marginTop: 2 },
  empty: { textAlign: "center", color: "#888", marginTop: 40 },
});

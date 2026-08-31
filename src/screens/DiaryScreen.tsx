import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Button,
  Alert,
  TextInput,
} from "react-native";
import type { Visit } from "../types";
import { listVisits, upsertScannedVisit, upsertVisit } from "../db/visitStore";
import { extractPhotoMetadata } from "../pipeline/extractPhotoMetadata";
import { clusterVisits } from "../pipeline/clusterVisits";
import { journalVisit } from "../pipeline/journalVisit";

export default function DiaryScreen() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(false);
  const [journalingId, setJournalingId] = useState<string | null>(null);
  const [transcriptDraft, setTranscriptDraft] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    setVisits(listVisits());
  }, []);

  function startJournaling(visit: Visit) {
    setJournalingId(visit.id);
    setTranscriptDraft(visit.transcript ?? "");
  }

  async function saveJournal(visit: Visit) {
    if (!transcriptDraft.trim()) return;
    setSavingId(visit.id);
    try {
      const entry = await journalVisit(transcriptDraft, visit.place.name);
      const updated: Visit = {
        ...visit,
        transcript: transcriptDraft,
        notes: entry.notes,
        tags: entry.tags,
        rating: entry.rating,
      };
      // upsertVisit also resyncs the FTS5 search index (see visitStore.ts)
      // so the visit becomes searchable as soon as it's journaled.
      upsertVisit(updated);
      setVisits(listVisits());
      setJournalingId(null);
    } catch (err: any) {
      Alert.alert("Journal failed", err.message ?? String(err));
    } finally {
      setSavingId(null);
    }
  }

  async function runScan() {
    setLoading(true);
    try {
      const since = new Date();
      since.setDate(since.getDate() - 7); // last 7 days for now

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
      <Text style={styles.header}>Foodie Journey</Text>
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
            {item.tags?.length ? (
              <Text style={styles.tags}>{item.tags.join(" · ")}</Text>
            ) : null}

            {journalingId === item.id ? (
              <View style={styles.journalForm}>
                <TextInput
                  style={styles.input}
                  multiline
                  placeholder="What did you think? (paste/type a transcript)"
                  value={transcriptDraft}
                  onChangeText={setTranscriptDraft}
                />
                <Button
                  title={savingId === item.id ? "Saving…" : "Save journal entry"}
                  onPress={() => saveJournal(item)}
                  disabled={savingId === item.id}
                />
              </View>
            ) : (
              <Button
                title={item.notes ? "Edit journal entry" : "Add journal entry"}
                onPress={() => startJournaling(item)}
              />
            )}
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
  container: { flex: 1, paddingTop: 16, paddingHorizontal: 16 },
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
  tags: { fontSize: 12, color: "#888", marginTop: 4 },
  journalForm: { marginTop: 8, gap: 8 },
  input: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 10,
    minHeight: 60,
    textAlignVertical: "top",
  },
  empty: { textAlign: "center", color: "#888", marginTop: 40 },
});

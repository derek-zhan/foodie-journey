import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Button,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import type { Visit } from "../types";
import { askDiary } from "../rag/searchDiary";

export default function AskDiaryScreen() {
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(false);

  async function ask() {
    if (!query.trim()) return;
    setLoading(true);
    setAnswer(null);
    setSources([]);
    try {
      const result = await askDiary(query);
      setAnswer(result.answer);
      setSources(result.sources);
    } catch (err: any) {
      setAnswer(`Something went wrong: ${err.message ?? String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Ask your diary</Text>
      <Text style={styles.hint}>
        Retrieval-augmented search over your journaled visits.
      </Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. where did I have good ramen?"
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={ask}
        returnKeyType="search"
      />
      <Button title={loading ? "Thinking…" : "Ask"} onPress={ask} disabled={loading} />

      {loading ? <ActivityIndicator style={styles.spinner} /> : null}

      <ScrollView style={styles.results}>
        {answer ? <Text style={styles.answer}>{answer}</Text> : null}
        {sources.map((v, i) => (
          <View key={v.id} style={styles.sourceCard}>
            <Text style={styles.sourcePlace}>
              [{i + 1}] {v.place.name}
            </Text>
            <Text style={styles.sourceMeta}>
              {new Date(v.startedAt).toLocaleDateString()}
              {v.rating ? ` · ${v.rating}/5` : ""}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 16, paddingHorizontal: 16 },
  header: { fontSize: 22, fontWeight: "600" },
  hint: { fontSize: 13, color: "#666", marginTop: 2, marginBottom: 12 },
  input: {
    backgroundColor: "#f2f2f2",
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  spinner: { marginTop: 16 },
  results: { marginTop: 16 },
  answer: { fontSize: 15, lineHeight: 21, marginBottom: 16 },
  sourceCard: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#f2f2f2",
    marginBottom: 8,
  },
  sourcePlace: { fontSize: 14, fontWeight: "600" },
  sourceMeta: { fontSize: 12, color: "#666", marginTop: 2 },
});

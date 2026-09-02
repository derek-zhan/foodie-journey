import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import type { Visit } from "../types";
import { askJourney } from "../rag/searchJourney";
import { colors, radii, shadow } from "../theme";

export default function AskJourneyScreen() {
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
      const result = await askJourney(query);
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
      <Text style={styles.header}>Ask your journey</Text>
      <Text style={styles.hint}>
        Retrieval-augmented search over your journaled visits.
      </Text>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.input}
          placeholder="e.g. where did I have good ramen?"
          placeholderTextColor={colors.textFaint}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={ask}
          returnKeyType="search"
        />
        <TouchableOpacity
          style={[styles.sendButton, loading && styles.sendButtonDisabled]}
          onPress={ask}
          disabled={loading}
          activeOpacity={0.75}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.sendIcon}>↑</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.results} showsVerticalScrollIndicator={false}>
        {answer ? <Text style={styles.answer}>{answer}</Text> : null}
        {sources.map((v, i) => (
          <View key={v.id} style={[styles.sourceCard, shadow.card]}>
            <View style={styles.sourceBadge}>
              <Text style={styles.sourceBadgeText}>{i + 1}</Text>
            </View>
            <View style={styles.sourceTextBlock}>
              <Text style={styles.sourcePlace}>{v.place.name}</Text>
              <Text style={styles.sourceMeta}>
                {new Date(v.startedAt).toLocaleDateString()}
                {v.rating ? ` · ${v.rating}/5` : ""}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 20, paddingHorizontal: 20 },
  header: { fontSize: 24, fontWeight: "700", color: colors.text },
  hint: { fontSize: 13, color: colors.textMuted, marginTop: 2, marginBottom: 16 },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radii.pill,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 15,
    color: colors.text,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: { opacity: 0.6 },
  sendIcon: { fontSize: 18, color: "#fff", fontWeight: "700" },
  results: { marginTop: 20 },
  answer: { fontSize: 15, lineHeight: 22, marginBottom: 16, color: colors.text },
  sourceCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: radii.md,
    backgroundColor: colors.card,
    marginBottom: 10,
  },
  sourceBadge: {
    width: 26,
    height: 26,
    borderRadius: radii.pill,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  sourceBadgeText: { fontSize: 12, fontWeight: "700", color: colors.accent },
  sourceTextBlock: { flex: 1 },
  sourcePlace: { fontSize: 14, fontWeight: "600", color: colors.text },
  sourceMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
});

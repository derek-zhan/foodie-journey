import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Button,
  Alert,
  StyleSheet,
} from "react-native";
import type { ResolvedPlace, Visit } from "../types";
import {
  searchNearbyPlaces,
  searchPlacesByText,
  type PlaceCandidate,
} from "../pipeline/resolvePlace";
import { updateVisitPlace } from "../db/visitStore";

interface Props {
  visit: Visit;
  onSaved: (updated: Visit) => void;
}

const MAX_ALTERNATES = 3;

// Tap a visit's restaurant name to correct it - up to 3 nearby
// alternatives, or "Other" to search Places by a typed name, so a
// mismatch from the auto-detection pipeline can be fixed with accurate
// data rather than a free-text label. Follows JournalForm.tsx's toggle-
// a-boolean-to-reveal-inline-UI convention (no modal/picker library
// exists in this app).
export default function RestaurantPicker({ visit, onSaved }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [alternates, setAlternates] = useState<PlaceCandidate[]>([]);
  const [otherMode, setOtherMode] = useState(false);
  const [queryDraft, setQueryDraft] = useState("");
  const [searching, setSearching] = useState(false);

  async function open() {
    setExpanded(true);
    setOtherMode(false);
    setLoading(true);
    try {
      const results = await searchNearbyPlaces(
        visit.place.latitude,
        visit.place.longitude
      );
      setAlternates(
        results
          .filter((c) => c.placeId !== visit.place.placeId)
          .slice(0, MAX_ALTERNATES)
      );
    } catch (err: any) {
      Alert.alert(
        "Couldn't load nearby restaurants",
        err.message ?? String(err)
      );
      setAlternates([]);
    } finally {
      setLoading(false);
    }
  }

  function close() {
    setExpanded(false);
    setOtherMode(false);
    setQueryDraft("");
  }

  function choose(place: ResolvedPlace) {
    const updated = updateVisitPlace(visit, place);
    close();
    onSaved(updated);
  }

  async function runTextSearch() {
    if (!queryDraft.trim()) return;
    setSearching(true);
    try {
      const results = await searchPlacesByText(
        queryDraft.trim(),
        visit.place.latitude,
        visit.place.longitude
      );
      if (results.length === 0) {
        Alert.alert("No matches found", `No results for "${queryDraft.trim()}".`);
        return;
      }
      choose(results[0]);
    } catch (err: any) {
      Alert.alert("Search failed", err.message ?? String(err));
    } finally {
      setSearching(false);
    }
  }

  if (!expanded) {
    return (
      <TouchableOpacity onPress={open}>
        <Text style={styles.place}>{visit.place.name}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.picker}>
      <Text style={styles.place}>{visit.place.name}</Text>
      {loading ? (
        <Text style={styles.hint}>Loading nearby restaurants…</Text>
      ) : (
        <>
          {alternates.map((c) => (
            <TouchableOpacity
              key={c.placeId}
              style={styles.row}
              onPress={() => choose(c)}
            >
              <Text style={styles.rowText}>{c.name}</Text>
              {c.address ? <Text style={styles.rowSub}>{c.address}</Text> : null}
            </TouchableOpacity>
          ))}
          {!otherMode ? (
            <TouchableOpacity style={styles.row} onPress={() => setOtherMode(true)}>
              <Text style={styles.rowText}>Other…</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.otherForm}>
              <TextInput
                style={styles.input}
                placeholder="Type the restaurant name"
                value={queryDraft}
                onChangeText={setQueryDraft}
              />
              <Button
                title={searching ? "Searching…" : "Search"}
                onPress={runTextSearch}
                disabled={searching}
              />
            </View>
          )}
          <Button title="Cancel" onPress={close} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  place: { fontSize: 16, fontWeight: "600" },
  picker: { gap: 6 },
  hint: { fontSize: 13, color: "#666" },
  row: { paddingVertical: 6 },
  rowText: { fontSize: 15, color: "#0a7ea4" },
  rowSub: { fontSize: 12, color: "#888" },
  otherForm: { gap: 6, marginTop: 4 },
  input: { backgroundColor: "#fff", borderRadius: 8, padding: 10 },
});

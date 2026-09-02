import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  TextInput,
  Modal,
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
import { colors, radii } from "../theme";
import AppButton from "./AppButton";

interface Props {
  visit: Visit;
  onSaved: (updated: Visit) => void;
}

const MAX_ALTERNATES = 3;

// Tap a visit's restaurant name to correct it - up to 3 nearby
// alternatives, or "Other" to search Places by a typed name, so a
// mismatch from the auto-detection pipeline can be fixed with accurate
// data rather than a free-text label. Options appear in an overlay
// dialog: tapping anywhere outside the options panel cancels (matches
// the Ask popup's tap-outside-to-close pattern in App.tsx), so there's
// no separate Cancel button to tap.
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

  return (
    <>
      <TouchableOpacity onPress={open} style={styles.placeRow}>
        <Text style={styles.place}>{visit.place.name}</Text>
        <Text style={styles.editHint}>✎</Text>
      </TouchableOpacity>

      <Modal
        visible={expanded}
        transparent
        animationType="fade"
        onRequestClose={close}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={close}
        >
          <TouchableWithoutFeedback>
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Change restaurant</Text>
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
                      {c.address ? (
                        <Text style={styles.rowSub}>{c.address}</Text>
                      ) : null}
                    </TouchableOpacity>
                  ))}
                  {!otherMode ? (
                    <TouchableOpacity
                      style={styles.row}
                      onPress={() => setOtherMode(true)}
                    >
                      <Text style={styles.rowText}>Other…</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.otherForm}>
                      <TextInput
                        style={styles.input}
                        placeholder="Type the restaurant name"
                        placeholderTextColor={colors.textFaint}
                        value={queryDraft}
                        onChangeText={setQueryDraft}
                        autoFocus
                      />
                      <AppButton
                        title={searching ? "Searching…" : "Search"}
                        onPress={runTextSearch}
                        disabled={searching}
                        variant="secondary"
                      />
                    </View>
                  )}
                </>
              )}
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  placeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  place: { fontSize: 17, fontWeight: "700", color: colors.text },
  editHint: { fontSize: 12, color: colors.textFaint },
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  panel: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 20,
    gap: 8,
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 4,
  },
  hint: { fontSize: 13, color: colors.textMuted },
  row: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.cardMuted,
    borderRadius: radii.sm,
  },
  rowText: { fontSize: 15, color: colors.accent, fontWeight: "600" },
  rowSub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  otherForm: { gap: 8, marginTop: 2 },
  input: {
    backgroundColor: colors.cardMuted,
    borderRadius: radii.sm,
    padding: 12,
    fontSize: 15,
    color: colors.text,
  },
});

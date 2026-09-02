import React, { useState } from "react";
import { View, Alert, TextInput, StyleSheet } from "react-native";
import type { Visit } from "../types";
import { upsertVisit } from "../db/visitStore";
import { journalVisit } from "../pipeline/journalVisit";
import { colors, radii } from "../theme";
import AppButton from "./AppButton";

interface Props {
  visit: Visit;
  onSaved: (updated: Visit) => void;
}

// Voice input is deliberately just a plain TextInput: iOS/Android keyboards
// both have a built-in mic button that dictates straight into a text field,
// so there's no need for an in-app recording UI or speech-to-text library.
export default function JournalForm({ visit, onSaved }: Props) {
  const [journaling, setJournaling] = useState(false);
  const [transcriptDraft, setTranscriptDraft] = useState(
    visit.transcript ?? ""
  );
  const [saving, setSaving] = useState(false);

  function startJournaling() {
    setTranscriptDraft(visit.transcript ?? "");
    setJournaling(true);
  }

  async function save() {
    if (!transcriptDraft.trim()) return;
    setSaving(true);
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
      setJournaling(false);
      onSaved(updated);
    } catch (err: any) {
      Alert.alert("Journal failed", err.message ?? String(err));
    } finally {
      setSaving(false);
    }
  }

  if (!journaling) {
    return (
      <AppButton
        title={visit.notes ? "Edit journal entry" : "Add journal entry"}
        onPress={startJournaling}
        variant="secondary"
      />
    );
  }

  return (
    <View style={styles.journalForm}>
      <TextInput
        style={styles.input}
        multiline
        placeholder="Tap the mic on your keyboard to dictate, or type"
        placeholderTextColor={colors.textFaint}
        value={transcriptDraft}
        onChangeText={setTranscriptDraft}
      />
      <AppButton
        title={saving ? "Saving…" : "Save journal entry"}
        onPress={save}
        loading={saving}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  journalForm: { marginTop: 8, gap: 8 },
  input: {
    backgroundColor: colors.cardMuted,
    borderRadius: radii.sm,
    padding: 12,
    minHeight: 70,
    fontSize: 15,
    color: colors.text,
    textAlignVertical: "top",
  },
});

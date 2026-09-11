import React, { useState } from "react";
import { View, Text, Alert, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import type { Visit } from "../types";
import { upsertVisit } from "../db/visitStore";
import { journalVisit, MissingApiKeyError } from "../pipeline/journalVisit";
import { colors, radii } from "../theme";
import AppButton from "./AppButton";

interface Props {
  visit: Visit;
  onSaved: (updated: Visit) => void;
}

const RATING_STARS = [1, 2, 3, 4, 5];

type Phase = "closed" | "transcript" | "review";

// Voice input is deliberately just a plain TextInput: iOS/Android keyboards
// both have a built-in mic button that dictates straight into a text field,
// so there's no need for an in-app recording UI or speech-to-text library.
//
// Two-phase flow: "transcript" (raw dictated/typed text -> Claude) then
// "review" (Claude's structured notes/tags/rating, editable, before it's
// actually written) - previously Claude's output was written verbatim with
// no chance to fix a hallucinated tag or a rating it misjudged; the only
// recourse was re-typing the whole transcript and hoping for a different
// result. "Regenerate" goes back to "transcript" without saving anything.
export default function JournalForm({ visit, onSaved }: Props) {
  const [phase, setPhase] = useState<Phase>("closed");
  const [transcriptDraft, setTranscriptDraft] = useState(
    visit.transcript ?? ""
  );
  const [generating, setGenerating] = useState(false);

  const [draftNotes, setDraftNotes] = useState("");
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const [draftRating, setDraftRating] = useState<number | undefined>(undefined);
  const [newTagText, setNewTagText] = useState("");

  function startJournaling() {
    setTranscriptDraft(visit.transcript ?? "");
    setPhase("transcript");
  }

  async function generate() {
    if (!transcriptDraft.trim()) return;
    setGenerating(true);
    try {
      const entry = await journalVisit(transcriptDraft, visit.place.name);
      setDraftNotes(entry.notes);
      setDraftTags(entry.tags);
      setDraftRating(entry.rating);
      setNewTagText("");
      setPhase("review");
    } catch (err: any) {
      if (err instanceof MissingApiKeyError) {
        Alert.alert(
          "API key needed",
          "Add EXPO_PUBLIC_ANTHROPIC_API_KEY to your .env file and restart Expo to enable journaling."
        );
      } else {
        Alert.alert("Journal failed", err.message ?? String(err));
      }
    } finally {
      setGenerating(false);
    }
  }

  function removeTag(tag: string) {
    setDraftTags((tags) => tags.filter((t) => t !== tag));
  }

  function addTag() {
    const tag = newTagText.trim().toLowerCase();
    if (!tag || draftTags.includes(tag)) {
      setNewTagText("");
      return;
    }
    setDraftTags((tags) => [...tags, tag]);
    setNewTagText("");
  }

  function save() {
    const updated: Visit = {
      ...visit,
      transcript: transcriptDraft,
      notes: draftNotes,
      tags: draftTags,
      rating: draftRating,
    };
    // upsertVisit also resyncs the FTS5 search index (see visitStore.ts)
    // so the visit becomes searchable as soon as it's journaled.
    upsertVisit(updated);
    setPhase("closed");
    onSaved(updated);
  }

  if (phase === "closed") {
    return (
      <AppButton
        title={visit.notes ? "Edit journal entry" : "Add journal entry"}
        onPress={startJournaling}
        variant="secondary"
      />
    );
  }

  if (phase === "transcript") {
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
          title={generating ? "Generating…" : "Generate journal entry"}
          onPress={generate}
          loading={generating}
        />
      </View>
    );
  }

  return (
    <View style={styles.journalForm}>
      <TextInput
        style={styles.input}
        multiline
        placeholder="Notes"
        placeholderTextColor={colors.textFaint}
        value={draftNotes}
        onChangeText={setDraftNotes}
      />

      <View style={styles.starRow}>
        {RATING_STARS.map((n) => (
          <TouchableOpacity
            key={n}
            onPress={() => setDraftRating(draftRating === n ? undefined : n)}
            accessibilityLabel={`Rate ${n} star${n === 1 ? "" : "s"}`}
          >
            <Text style={styles.star}>
              {draftRating != null && n <= draftRating ? "★" : "☆"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.tagRow}>
        {draftTags.map((tag) => (
          <TouchableOpacity
            key={tag}
            style={styles.tagChip}
            onPress={() => removeTag(tag)}
            accessibilityLabel={`Remove tag ${tag}`}
          >
            <Text style={styles.tagChipText}>{tag} ×</Text>
          </TouchableOpacity>
        ))}
        <TextInput
          style={styles.tagInput}
          placeholder="Add tag"
          placeholderTextColor={colors.textFaint}
          value={newTagText}
          onChangeText={setNewTagText}
          onSubmitEditing={addTag}
          returnKeyType="done"
        />
      </View>

      <View style={styles.reviewActions}>
        <View style={styles.reviewActionFlex}>
          <AppButton title="Regenerate" onPress={() => setPhase("transcript")} variant="ghost" />
        </View>
        <View style={styles.reviewActionFlex}>
          <AppButton title="Save journal entry" onPress={save} />
        </View>
      </View>
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
  starRow: { flexDirection: "row", gap: 6 },
  star: { fontSize: 22, color: colors.accent },
  tagRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  tagChip: {
    backgroundColor: colors.accentSoft,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tagChipText: { fontSize: 12, color: colors.accent, fontWeight: "600" },
  tagInput: {
    backgroundColor: colors.cardMuted,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 12,
    color: colors.text,
    minWidth: 90,
  },
  reviewActions: { flexDirection: "row", gap: 8, marginTop: 4 },
  reviewActionFlex: { flex: 1 },
});

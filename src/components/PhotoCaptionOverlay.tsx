import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Image } from "expo-image";
import type { Visit } from "../types";
import { colors, radii } from "../theme";

interface Props {
  visit: Visit | null;
  thumbnails: Record<string, string | null>;
  onClose: () => void;
  onSave: (visitId: string, captions: Record<string, string>) => void;
}

// Full-screen viewer for one visit's photos, each with its own caption
// field - opened by tapping the thumbnail row on JourneyScreen. Captions are
// buffered locally and written back in one updatePhotoCaptions call when
// the sheet closes, rather than on every keystroke.
export default function PhotoCaptionOverlay({
  visit,
  thumbnails,
  onClose,
  onSave,
}: Props) {
  const [captions, setCaptions] = useState<Record<string, string>>({});

  useEffect(() => {
    if (visit) setCaptions(visit.photoCaptions ?? {});
  }, [visit]);

  function handleDone() {
    if (visit) onSave(visit.id, captions);
    onClose();
  }

  return (
    <Modal
      visible={visit != null}
      animationType="slide"
      onRequestClose={handleDone}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>
            {visit?.place.name}
          </Text>
          <TouchableOpacity onPress={handleDone}>
            <Text style={styles.doneText}>Done</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          {visit?.photoIds.map((id) =>
            thumbnails[id] ? (
              <View key={id} style={styles.photoBlock}>
                <Image source={{ uri: thumbnails[id]! }} style={styles.photo} />
                <TextInput
                  style={styles.captionInput}
                  placeholder="Add a caption for this photo…"
                  placeholderTextColor={colors.textFaint}
                  value={captions[id] ?? ""}
                  onChangeText={(text) =>
                    setCaptions((prev) => ({ ...prev, [id]: text }))
                  }
                  multiline
                />
              </View>
            ) : null
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: 60 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  title: { fontSize: 18, fontWeight: "700", color: colors.text, flex: 1, marginRight: 12 },
  doneText: { fontSize: 16, fontWeight: "600", color: colors.accent },
  content: { paddingHorizontal: 20, paddingBottom: 60, gap: 24 },
  photoBlock: { gap: 8 },
  photo: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: radii.lg,
    backgroundColor: colors.cardMuted,
  },
  captionInput: {
    backgroundColor: colors.card,
    borderRadius: radii.sm,
    padding: 12,
    minHeight: 44,
    fontSize: 14,
    color: colors.text,
    textAlignVertical: "top",
  },
});

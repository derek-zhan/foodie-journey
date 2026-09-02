import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import ViewShot, { type ViewShotRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import type { Visit } from "../types";
import StoryTemplate from "./StoryTemplate";
import { colors, radii } from "../theme";

interface Props {
  visit: Visit | null;
  thumbnails: Record<string, string | null>;
  onClose: () => void;
}

// Full-screen preview/export flow for turning one visit into an IG-Story
// image: pick a background photo, tweak the caption, rasterize the
// StoryTemplate preview via ViewShot, then hand the PNG to the OS share
// sheet (expo-sharing) for the user to post themselves. No Graph API
// posting - see plan doc for why, and for the follow-up that swaps this
// generic share sheet for Instagram's Stories-composer-specific deep link.
export default function StoryExportOverlay({ visit, thumbnails, onClose }: Props) {
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [sharing, setSharing] = useState(false);
  const viewShotRef = useRef<ViewShotRef>(null);

  useEffect(() => {
    setCaption(visit?.notes ?? "");
    setSelectedPhotoId(null);
  }, [visit?.id]);

  useEffect(() => {
    if (!visit || selectedPhotoId) return;
    const firstAvailable = visit.photoIds.find((id) => thumbnails[id]);
    if (firstAvailable) setSelectedPhotoId(firstAvailable);
  }, [visit, thumbnails, selectedPhotoId]);

  async function handleShare() {
    if (!viewShotRef.current) return;
    setSharing(true);
    try {
      const uri = await viewShotRef.current.capture();
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "image/png",
          dialogTitle: "Share your food story",
        });
      } else {
        Alert.alert("Sharing isn't available on this device");
      }
    } catch (err: any) {
      Alert.alert("Couldn't create story image", err.message ?? String(err));
    } finally {
      setSharing(false);
    }
  }

  const photoUri = selectedPhotoId ? thumbnails[selectedPhotoId] ?? null : null;

  return (
    <Modal visible={visit != null} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>
            {visit?.place.name}
          </Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <ViewShot ref={viewShotRef} options={{ format: "png", quality: 1 }}>
            <StoryTemplate
              photoUri={photoUri}
              placeName={visit?.place.name ?? ""}
              rating={visit?.rating}
              caption={caption}
            />
          </ViewShot>

          {visit && visit.photoIds.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.photoRow}
            >
              {visit.photoIds.map((id) =>
                thumbnails[id] ? (
                  <TouchableOpacity
                    key={id}
                    onPress={() => setSelectedPhotoId(id)}
                    style={[
                      styles.photoThumbWrap,
                      selectedPhotoId === id && styles.photoThumbWrapSelected,
                    ]}
                  >
                    <Image source={{ uri: thumbnails[id]! }} style={styles.photoThumb} />
                  </TouchableOpacity>
                ) : null
              )}
            </ScrollView>
          ) : null}

          <TextInput
            style={styles.captionInput}
            placeholder="Write a caption for your story…"
            placeholderTextColor={colors.textFaint}
            value={caption}
            onChangeText={setCaption}
            multiline
          />

          <TouchableOpacity
            style={[styles.shareButton, (sharing || !photoUri) && styles.shareButtonDisabled]}
            onPress={handleShare}
            disabled={sharing || !photoUri}
          >
            <Text style={styles.shareButtonText}>{sharing ? "Preparing…" : "Share"}</Text>
          </TouchableOpacity>
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
  closeText: { fontSize: 16, fontWeight: "600", color: colors.accent },
  content: { paddingHorizontal: 20, paddingBottom: 60, alignItems: "center", gap: 16 },
  photoRow: { alignSelf: "stretch" },
  photoThumbWrap: {
    marginRight: 8,
    borderRadius: radii.sm,
    borderWidth: 2,
    borderColor: "transparent",
  },
  photoThumbWrapSelected: { borderColor: colors.accent },
  photoThumb: {
    width: 60,
    height: 60,
    borderRadius: radii.sm - 2,
    backgroundColor: colors.cardMuted,
  },
  captionInput: {
    alignSelf: "stretch",
    backgroundColor: colors.card,
    borderRadius: radii.sm,
    padding: 12,
    minHeight: 60,
    fontSize: 14,
    color: colors.text,
    textAlignVertical: "top",
  },
  shareButton: {
    alignSelf: "stretch",
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    paddingVertical: 14,
    alignItems: "center",
  },
  shareButtonDisabled: { opacity: 0.6 },
  shareButtonText: { fontSize: 16, fontWeight: "700", color: "#fff" },
});

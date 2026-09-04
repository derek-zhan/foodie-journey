import React, { useEffect, useState } from "react";
import {
  View,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Text,
  StyleSheet,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import JourneyScreen from "./src/screens/JourneyScreen";
import AskJourneyScreen from "./src/screens/AskJourneyScreen";
import GlassSurface from "./src/components/GlassSurface";
import { initDb } from "./src/db/visitStore";
import { colors, glass, radii } from "./src/theme";

export default function App() {
  const [askVisible, setAskVisible] = useState(false);

  useEffect(() => {
    initDb();
  }, []);

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={styles.root}>
        <View style={styles.root}>
          <JourneyScreen />

          <TouchableOpacity
            style={styles.fabTouchable}
            onPress={() => setAskVisible(true)}
          >
            <GlassSurface
              variant="real"
              tone="accent"
              radius={radii.pill}
              shadowTier="fab"
              style={styles.fabGlass}
              contentStyle={styles.fabContent}
            >
              <Text style={styles.fabIcon}>💬</Text>
            </GlassSurface>
          </TouchableOpacity>

          <Modal
            visible={askVisible}
            animationType="fade"
            transparent
            onRequestClose={() => setAskVisible(false)}
          >
            <TouchableOpacity
              style={styles.backdrop}
              activeOpacity={1}
              onPress={() => setAskVisible(false)}
            >
              <TouchableWithoutFeedback>
                <GlassSurface
                  variant="real"
                  tone="light"
                  strong
                  radius={{ topLeft: radii.lg, topRight: radii.lg }}
                  shadowTier="none"
                  style={styles.sheetGlass}
                  contentStyle={styles.sheetContent}
                >
                  <View style={styles.grabber} />
                  <AskJourneyScreen />
                </GlassSurface>
              </TouchableWithoutFeedback>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.fabTouchable}
              accessibilityLabel="Close ask your journey"
              onPress={() => setAskVisible(false)}
            >
              <GlassSurface
                variant="real"
                tone="accent"
                radius={radii.pill}
                shadowTier="fab"
                style={styles.fabGlass}
                contentStyle={styles.fabContent}
              >
                <Text style={styles.fabIcon}>✕</Text>
              </GlassSurface>
            </TouchableOpacity>
          </Modal>

          <StatusBar style="auto" />
        </View>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  fabTouchable: {
    position: "absolute",
    right: 20,
    bottom: 32,
    width: 58,
    height: 58,
  },
  fabGlass: { width: "100%", height: "100%" },
  fabContent: { flex: 1, alignItems: "center", justifyContent: "center" },
  fabIcon: { fontSize: 24 },
  backdrop: {
    flex: 1,
    backgroundColor: glass.overlayBackdrop,
    justifyContent: "flex-end",
  },
  sheetGlass: { height: "78%" },
  sheetContent: { flex: 1 },
  grabber: {
    width: 40,
    height: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginTop: 10,
  },
});

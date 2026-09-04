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
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import JourneyScreen from "./src/screens/JourneyScreen";
import MapScreen from "./src/screens/MapScreen";
import MeScreen from "./src/screens/MeScreen";
import AskJourneyScreen from "./src/screens/AskJourneyScreen";
import GlassSurface from "./src/components/GlassSurface";
import BottomTabBar, { type TabKey } from "./src/components/BottomTabBar";
import { initDb } from "./src/db/visitStore";
import { colors, glass, radii, TAB_BAR_HEIGHT } from "./src/theme";

function AppContent() {
  const [askVisible, setAskVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("timeline");
  const insets = useSafeAreaInsets();
  const fabBottom = insets.bottom + TAB_BAR_HEIGHT + 16;

  useEffect(() => {
    initDb();
  }, []);

  return (
    <View style={styles.root}>
      {/* All three stay mounted (toggled via display, not conditional
          rendering) so switching tabs doesn't remount JourneyScreen -
          that used to re-trigger its mount-time scan effect and briefly
          clear its visits state every time you came back to Timeline. */}
      <View style={[styles.screenLayer, activeTab !== "timeline" && styles.hiddenLayer]}>
        <JourneyScreen />
      </View>
      <View style={[styles.screenLayer, activeTab !== "map" && styles.hiddenLayer]}>
        <MapScreen active={activeTab === "map"} />
      </View>
      <View style={[styles.screenLayer, activeTab !== "me" && styles.hiddenLayer]}>
        <MeScreen active={activeTab === "me"} />
      </View>

      <BottomTabBar activeTab={activeTab} onChange={setActiveTab} />

      <TouchableOpacity
        style={[styles.fabTouchable, { bottom: fabBottom }]}
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
          style={[styles.fabTouchable, { bottom: fabBottom }]}
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
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={styles.root}>
        <AppContent />
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  screenLayer: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  hiddenLayer: { display: "none" },
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

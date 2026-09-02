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
import DiaryScreen from "./src/screens/DiaryScreen";
import AskDiaryScreen from "./src/screens/AskDiaryScreen";
import { initDb } from "./src/db/visitStore";
import { colors, radii, shadow } from "./src/theme";

export default function App() {
  const [askVisible, setAskVisible] = useState(false);

  useEffect(() => {
    initDb();
  }, []);

  return (
    <View style={styles.root}>
      <DiaryScreen />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => setAskVisible(true)}
      >
        <Text style={styles.fabIcon}>💬</Text>
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
            <View style={styles.sheet}>
              <View style={styles.grabber} />
              <AskDiaryScreen />
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 32,
    width: 58,
    height: 58,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.fab,
  },
  fabIcon: { fontSize: 24 },
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "flex-end",
  },
  sheet: {
    height: "78%",
    backgroundColor: colors.bg,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    overflow: "hidden",
  },
  grabber: {
    width: 40,
    height: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginTop: 10,
  },
});

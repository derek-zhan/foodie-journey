import React, { useEffect, useState } from "react";
import { View, Button, Modal, TouchableOpacity, Text, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import DiaryScreen from "./src/screens/DiaryScreen";
import AskDiaryScreen from "./src/screens/AskDiaryScreen";
import { initDb } from "./src/db/visitStore";

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
        animationType="slide"
        onRequestClose={() => setAskVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Button title="Close" onPress={() => setAskVisible(false)} />
          </View>
          <AskDiaryScreen />
        </View>
      </Modal>

      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 32,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#222",
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  fabIcon: { fontSize: 26 },
  modalContainer: { flex: 1, paddingTop: 60 },
  modalHeader: {
    alignItems: "flex-end",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
});

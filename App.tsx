import React, { useEffect, useState } from "react";
import { View, Button, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import DiaryScreen from "./src/screens/DiaryScreen";
import ReviewScreen from "./src/screens/ReviewScreen";
import AskDiaryScreen from "./src/screens/AskDiaryScreen";
import { initDb } from "./src/db/visitStore";

type Tab = "diary" | "review" | "ask";

export default function App() {
  const [tab, setTab] = useState<Tab>("diary");

  useEffect(() => {
    initDb();
  }, []);

  return (
    <View style={styles.root}>
      <View style={styles.tabBar}>
        <Button
          title="Diary"
          onPress={() => setTab("diary")}
          color={tab === "diary" ? undefined : "#888"}
        />
        <Button
          title="Review"
          onPress={() => setTab("review")}
          color={tab === "review" ? undefined : "#888"}
        />
        <Button
          title="Ask"
          onPress={() => setTab("ask")}
          color={tab === "ask" ? undefined : "#888"}
        />
      </View>
      {tab === "diary" ? (
        <DiaryScreen />
      ) : tab === "review" ? (
        <ReviewScreen />
      ) : (
        <AskDiaryScreen />
      )}
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  tabBar: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 24,
    paddingTop: 60,
  },
});

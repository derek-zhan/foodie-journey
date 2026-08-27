import { StatusBar } from "expo-status-bar";
import DiaryScreen from "./src/screens/DiaryScreen";

export default function App() {
  return (
    <>
      <DiaryScreen />
      <StatusBar style="auto" />
    </>
  );
}

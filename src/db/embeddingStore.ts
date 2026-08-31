import { Platform } from "react-native";
import * as SQLite from "expo-sqlite";

// Same web fallback as visitStore.ts - see the comment there.
const db =
  Platform.OS === "web" ? null : SQLite.openDatabaseSync("foodie-journey.db");
const memoryEmbeddings = new Map<string, number[]>();

// One embedding per visit, keyed to whatever text was embedded for it
// (currently the journaled notes + tags - see rag/searchDiary.ts). A visit
// with no journal entry yet has no row here and is simply unsearchable.
export function initEmbeddingStore() {
  if (!db) return;
  db.execSync(`
    CREATE TABLE IF NOT EXISTS visit_embeddings (
      visitId TEXT PRIMARY KEY NOT NULL,
      embedding TEXT NOT NULL,
      model TEXT NOT NULL
    );
  `);
}

export function upsertVisitEmbedding(
  visitId: string,
  embedding: number[],
  model: string
) {
  if (!db) {
    memoryEmbeddings.set(visitId, embedding);
    return;
  }

  db.runSync(
    `INSERT INTO visit_embeddings (visitId, embedding, model)
     VALUES (?, ?, ?)
     ON CONFLICT(visitId) DO UPDATE SET
      embedding=excluded.embedding,
      model=excluded.model;`,
    [visitId, JSON.stringify(embedding), model]
  );
}

export function listVisitEmbeddings(): {
  visitId: string;
  embedding: number[];
}[] {
  if (!db) {
    return Array.from(memoryEmbeddings.entries()).map(
      ([visitId, embedding]) => ({ visitId, embedding })
    );
  }

  const rows = db.getAllSync<any>(`SELECT * FROM visit_embeddings;`);
  return rows.map((row) => ({
    visitId: row.visitId,
    embedding: JSON.parse(row.embedding),
  }));
}

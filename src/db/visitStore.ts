import { Platform } from "react-native";
import * as SQLite from "expo-sqlite";
import type { Visit } from "../types";

// expo-sqlite's web backend bridges to a worker via a busy-wait spin on a
// SharedArrayBuffer (see WorkerChannel.ts) rather than a real async wait -
// in practice it times out unpredictably even with correct cross-origin
// isolation headers (see scripts/webDev.js). Native (iOS/Android) uses the
// real synchronous SQLite API; web falls back to an in-memory store so the
// app is at least usable there, with the caveat that nothing persists
// across a page reload.
const db =
  Platform.OS === "web" ? null : SQLite.openDatabaseSync("foodie-journey.db");
const memoryVisits = new Map<string, Visit>();

export function initDb() {
  if (!db) return;
  db.execSync(`
    CREATE TABLE IF NOT EXISTS visits (
      id TEXT PRIMARY KEY NOT NULL,
      placeName TEXT NOT NULL,
      address TEXT,
      latitude REAL,
      longitude REAL,
      photoIds TEXT NOT NULL,
      startedAt INTEGER NOT NULL,
      endedAt INTEGER NOT NULL,
      transcript TEXT,
      notes TEXT,
      rating INTEGER,
      tags TEXT,
      confirmed INTEGER NOT NULL DEFAULT 0
    );
  `);
}

export function upsertVisit(visit: Visit) {
  if (!db) {
    memoryVisits.set(visit.id, visit);
    return;
  }

  db.runSync(
    `INSERT INTO visits
      (id, placeName, address, latitude, longitude, photoIds, startedAt, endedAt, transcript, notes, rating, tags, confirmed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
      transcript=excluded.transcript,
      notes=excluded.notes,
      rating=excluded.rating,
      tags=excluded.tags,
      confirmed=excluded.confirmed;`,
    [
      visit.id,
      visit.place.name,
      visit.place.address,
      visit.place.latitude,
      visit.place.longitude,
      JSON.stringify(visit.photoIds),
      visit.startedAt,
      visit.endedAt,
      visit.transcript ?? null,
      visit.notes ?? null,
      visit.rating ?? null,
      JSON.stringify(visit.tags ?? []),
      visit.confirmed ? 1 : 0,
    ]
  );
}

export function listVisits(): Visit[] {
  if (!db) {
    return Array.from(memoryVisits.values()).sort(
      (a, b) => b.startedAt - a.startedAt
    );
  }

  const rows = db.getAllSync<any>(
    `SELECT * FROM visits ORDER BY startedAt DESC;`
  );
  return rows.map((row) => ({
    id: row.id,
    place: {
      placeId: row.id.split("-")[0],
      name: row.placeName,
      address: row.address,
      latitude: row.latitude,
      longitude: row.longitude,
      types: [],
    },
    photoIds: JSON.parse(row.photoIds),
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    transcript: row.transcript ?? undefined,
    notes: row.notes ?? undefined,
    rating: row.rating ?? undefined,
    tags: JSON.parse(row.tags ?? "[]"),
    confirmed: !!row.confirmed,
  }));
}

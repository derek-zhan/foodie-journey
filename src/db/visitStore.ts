import * as SQLite from "expo-sqlite";
import type { Visit } from "../types";

const db = SQLite.openDatabaseSync("foodie-journey.db");

export function initDb() {
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

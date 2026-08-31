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

const SEARCH_LIMIT = 5;

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

  // Full-text index over each visit's searchable text (place name + notes
  // + tags) - powers rag/searchDiary.ts's retrieval step, entirely local
  // (no embeddings, no external API). expo-sqlite ships FTS5 enabled by
  // default on both iOS and Android. Kept as its own virtual table and
  // resynced on every upsertVisit (see below) rather than a visits column,
  // so "what's searchable" stays in one place.
  db.execSync(`
    CREATE VIRTUAL TABLE IF NOT EXISTS visits_fts USING fts5(
      visitId UNINDEXED,
      content
    );
  `);
}

function searchableText(visit: Visit): string {
  return [visit.place.name, visit.notes, visit.tags?.join(" ")]
    .filter(Boolean)
    .join(" ");
}

// "Journaled" = has notes OR tags. journalVisit's output schema doesn't
// require non-empty notes (a response could carry tags with no notes
// text), so gating on notes alone would silently drop a journaled-but-
// notes-less visit from the search index.
function isJournaled(visit: Visit): boolean {
  return Boolean(visit.notes || visit.tags?.length);
}

// DiaryScreen's "Scan recent photos" re-upserts every visit clusterVisits
// re-detects in the window, including ones already journaled - and a
// freshly-clustered Visit has no transcript/notes/rating/tags at all (see
// clusterVisits.ts). Without this merge, that re-scan would blindly
// overwrite (SQL) or replace (web) an existing journal entry with blanks.
function mergeJournalFields(incoming: Visit, existing: Visit | null): Visit {
  if (!existing) return incoming;
  return {
    ...incoming,
    transcript: incoming.transcript ?? existing.transcript,
    notes: incoming.notes ?? existing.notes,
    rating: incoming.rating ?? existing.rating,
    tags: incoming.tags ?? existing.tags,
  };
}

export function upsertVisit(visit: Visit) {
  if (!db) {
    memoryVisits.set(visit.id, mergeJournalFields(visit, memoryVisits.get(visit.id) ?? null));
    return;
  }

  db.withTransactionSync(() => {
    db.runSync(
      `INSERT INTO visits
        (id, placeName, address, latitude, longitude, photoIds, startedAt, endedAt, transcript, notes, rating, tags, confirmed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
        transcript=COALESCE(excluded.transcript, visits.transcript),
        notes=COALESCE(excluded.notes, visits.notes),
        rating=COALESCE(excluded.rating, visits.rating),
        tags=COALESCE(excluded.tags, visits.tags),
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
        visit.tags ? JSON.stringify(visit.tags) : null,
        visit.confirmed ? 1 : 0,
      ]
    );

    // Re-sync the FTS row from what's now actually persisted, not the raw
    // `visit` param - a re-scan's blank incoming fields were just merged
    // against the existing row above (COALESCE), and the FTS content has
    // to reflect that merge, not the pre-merge input.
    const row = db.getFirstSync<any>(`SELECT * FROM visits WHERE id = ?;`, [
      visit.id,
    ]);
    const persisted = row ? rowToVisit(row) : visit;

    db.runSync(`DELETE FROM visits_fts WHERE visitId = ?;`, [visit.id]);
    if (isJournaled(persisted)) {
      db.runSync(`INSERT INTO visits_fts (visitId, content) VALUES (?, ?);`, [
        visit.id,
        searchableText(persisted),
      ]);
    }
  });
}

function rowToVisit(row: any): Visit {
  return {
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
  };
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
  return rows.map(rowToVisit);
}

// Turns a raw user query into an FTS5 MATCH expression: each token
// double-quoted (an FTS5 string literal - AND/OR/NOT/*/-/: etc. inside one
// are just literal text, not parsed as syntax) and OR'd together for
// recall. The only character that can break out of a quoted literal is an
// embedded `"`, so that's the only thing stripped - deliberately not a
// \w-only filter, which would mangle accented or non-Latin text (café,
// 拉面) that FTS5's default unicode61 tokenizer otherwise handles fine.
// Returns null for an empty/whitespace-only query.
function toFtsMatchQuery(query: string): string | null {
  const tokens = query
    .split(/\s+/)
    .map((t) => t.replace(/"/g, ""))
    .filter(Boolean);
  if (tokens.length === 0) return null;
  return tokens.map((t) => `"${t}"`).join(" OR ");
}

/**
 * Full-text search over journaled visits (place name + notes + tags),
 * ranked by SQLite FTS5's bm25(). On web (in-memory fallback, no real
 * SQLite - see the comment above) this degrades to a plain keyword-overlap
 * scan over the same fields. Both paths only consider journaled visits
 * (see isJournaled) so a bare scanned-but-unjournaled visit never matches.
 */
export function searchVisits(query: string): Visit[] {
  if (!db) {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];
    return Array.from(memoryVisits.values())
      .filter(isJournaled)
      .map((visit) => {
        const text = searchableText(visit).toLowerCase();
        return { visit, score: tokens.filter((t) => text.includes(t)).length };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, SEARCH_LIMIT)
      .map((r) => r.visit);
  }

  const matchQuery = toFtsMatchQuery(query);
  if (!matchQuery) return [];

  // bm25() is more-negative-is-better in FTS5, so ascending order ranks
  // best matches first.
  const matches = db.getAllSync<{ visitId: string }>(
    `SELECT visitId FROM visits_fts WHERE visits_fts MATCH ? ORDER BY bm25(visits_fts) LIMIT ?;`,
    [matchQuery, SEARCH_LIMIT]
  );
  if (matches.length === 0) return [];

  // Fetch only the matched rows (not the whole table) - the FTS index only
  // pays off if this stays O(matches), not O(all visits).
  const placeholders = matches.map(() => "?").join(", ");
  const rows = db.getAllSync<any>(
    `SELECT * FROM visits WHERE id IN (${placeholders});`,
    matches.map((m) => m.visitId)
  );
  const visitById = new Map(rows.map((row) => [row.id, rowToVisit(row)]));
  return matches
    .map((m) => visitById.get(m.visitId))
    .filter((v): v is Visit => v != null);
}

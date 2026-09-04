import { Platform } from "react-native";
import * as SQLite from "expo-sqlite";
import type { ResolvedPlace, Visit } from "../types";

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
const memoryExcludedPhotoIds = new Set<string>();

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
      confirmed INTEGER NOT NULL DEFAULT 0,
      photoCaptions TEXT
    );
  `);
  ensurePhotoCaptionsColumn(db);

  // Full-text index over each visit's searchable text (place name + notes
  // + tags) - powers rag/searchJourney.ts's retrieval step, entirely local
  // (no embeddings, no external API). expo-sqlite ships FTS5 enabled by
  // default on both iOS and Android. Kept as its own virtual table and
  // resynced on every write rather than a visits column, so "what's
  // searchable" stays in one place.
  db.execSync(`
    CREATE VIRTUAL TABLE IF NOT EXISTS visits_fts USING fts5(
      visitId UNINDEXED,
      content
    );
  `);

  backfillFtsIndex(db);

  // Photo ids the user explicitly removed a visit for - checked by
  // JourneyScreen.runScan before clustering so those photos can never form
  // a visit again (at this or any other place), not just re-form the exact
  // same visit id. See excludePhotos/getExcludedPhotoIds below.
  db.execSync(`
    CREATE TABLE IF NOT EXISTS excluded_photos (
      photoId TEXT PRIMARY KEY NOT NULL
    );
  `);
}

// CREATE TABLE IF NOT EXISTS is a no-op against a visits table that already
// existed before photoCaptions was added to the schema above - ALTER TABLE
// is the only way to add it to those already-created on-device DBs.
function ensurePhotoCaptionsColumn(database: SQLite.SQLiteDatabase) {
  const columns = database.getAllSync<{ name: string }>(
    `PRAGMA table_info(visits);`
  );
  if (!columns.some((c) => c.name === "photoCaptions")) {
    database.execSync(`ALTER TABLE visits ADD COLUMN photoCaptions TEXT;`);
  }
}

// One-time-per-launch catch-up: a visits_fts row only gets written by
// writeVisitRow, so any visit that was already journaled before this
// virtual table existed (or before any particular row was last touched)
// would otherwise be invisible to search forever, even though it's right
// there in `visits`. Cheap at personal-journey scale; only inserts what's
// actually missing.
function backfillFtsIndex(database: SQLite.SQLiteDatabase) {
  const indexed = new Set(
    database
      .getAllSync<{ visitId: string }>(`SELECT visitId FROM visits_fts;`)
      .map((r) => r.visitId)
  );
  const rows = database.getAllSync<any>(`SELECT * FROM visits;`);
  for (const row of rows) {
    const visit = rowToVisit(row);
    if (indexed.has(visit.id) || !isJournaled(visit)) continue;
    database.runSync(
      `INSERT INTO visits_fts (visitId, content) VALUES (?, ?);`,
      [visit.id, searchableText(visit)]
    );
  }
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
    photoCaptions: row.photoCaptions ? JSON.parse(row.photoCaptions) : undefined,
  };
}

// Writes exactly the given Visit - no merging. Also resyncs the FTS row
// from that same value (no extra read needed: it IS what's being
// persisted). Shared by upsertVisit and upsertScannedVisit below, once
// each has decided what the final value should be.
function writeVisitRow(database: SQLite.SQLiteDatabase, visit: Visit) {
  database.runSync(
    `INSERT INTO visits
      (id, placeName, address, latitude, longitude, photoIds, startedAt, endedAt, transcript, notes, rating, tags, confirmed, photoCaptions)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
      placeName=excluded.placeName,
      address=excluded.address,
      latitude=excluded.latitude,
      longitude=excluded.longitude,
      photoIds=excluded.photoIds,
      startedAt=excluded.startedAt,
      endedAt=excluded.endedAt,
      transcript=excluded.transcript,
      notes=excluded.notes,
      rating=excluded.rating,
      tags=excluded.tags,
      confirmed=excluded.confirmed,
      photoCaptions=excluded.photoCaptions;`,
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
      visit.photoCaptions ? JSON.stringify(visit.photoCaptions) : null,
    ]
  );

  database.runSync(`DELETE FROM visits_fts WHERE visitId = ?;`, [visit.id]);
  if (isJournaled(visit)) {
    database.runSync(
      `INSERT INTO visits_fts (visitId, content) VALUES (?, ?);`,
      [visit.id, searchableText(visit)]
    );
  }
}

/**
 * Deliberate write of exactly what's passed - e.g. JourneyScreen.saveJournal
 * saving a fresh journalVisit() result, including a legitimately-absent
 * rating clearing out a previous one. Does NOT protect against blanking
 * notes/tags/rating/confirmed - for the photo-rescan path, where the
 * incoming Visit carries no journal info at all, use upsertScannedVisit.
 *
 * Also unlike upsertScannedVisit, this overwrites place/photoIds/
 * startedAt/endedAt unconditionally - the DB no longer enforces those as
 * write-once for this path (the old code got that for free by omitting
 * the columns from the SQL SET clause; a full-column overwrite can't do
 * that trick). Currently harmless because saveJournal always spreads a
 * complete, freshly-listed Visit - but a future caller passing a partial
 * or stale Visit here would silently overwrite those identity fields with
 * no compiler or DB-level guard against it.
 */
export function upsertVisit(visit: Visit) {
  if (!db) {
    memoryVisits.set(visit.id, visit);
    return;
  }
  db.withTransactionSync(() => writeVisitRow(db, visit));
}

/**
 * Corrects a visit's restaurant after the user picks an alternate or
 * types a manual match (RestaurantPicker.tsx). Unlike upsertVisit, this
 * changes `place`, which changes the derived id (`${placeId}-${startedAt}`
 * - see rowToVisit) - so it can't be an UPDATE against the existing row;
 * it deletes the old row + its FTS entry and inserts fresh under the new
 * id. Always sets confirmed: true - the user is actively confirming the
 * match.
 */
export function updateVisitPlace(visit: Visit, newPlace: ResolvedPlace): Visit {
  const updated: Visit = {
    ...visit,
    id: `${newPlace.placeId}-${visit.startedAt}`,
    place: newPlace,
    confirmed: true,
  };

  if (!db) {
    if (updated.id !== visit.id) memoryVisits.delete(visit.id);
    memoryVisits.set(updated.id, updated);
    return updated;
  }

  db.withTransactionSync(() => {
    if (updated.id !== visit.id) {
      db.runSync(`DELETE FROM visits WHERE id = ?;`, [visit.id]);
      db.runSync(`DELETE FROM visits_fts WHERE visitId = ?;`, [visit.id]);
    }
    writeVisitRow(db, updated);
  });
  return updated;
}

/**
 * Saves per-photo captions from the overlay (JourneyScreen's thumbnail row).
 * Reads the current row first and overwrites just photoCaptions, the same
 * "merge one field, write the whole row" shape as updateVisitPlace - a
 * plain upsertVisit(visit) from a stale in-memory Visit would silently
 * clobber any journal edit made while the overlay was open.
 */
export function updatePhotoCaptions(
  visitId: string,
  photoCaptions: Record<string, string>
): Visit {
  if (!db) {
    const existing = memoryVisits.get(visitId);
    if (!existing) throw new Error(`No visit found for id ${visitId}`);
    const updated: Visit = { ...existing, photoCaptions };
    memoryVisits.set(visitId, updated);
    return updated;
  }

  const row = db.getFirstSync<any>(`SELECT * FROM visits WHERE id = ?;`, [
    visitId,
  ]);
  if (!row) throw new Error(`No visit found for id ${visitId}`);
  const updated: Visit = { ...rowToVisit(row), photoCaptions };
  db.withTransactionSync(() => writeVisitRow(db, updated));
  return updated;
}

// Re-scan = never let it clobber an existing journal entry or the
// place/photo/time identity it was created with (both write-once, same
// as the original pre-FTS5 design - just enforced in JS now instead of
// via SQL's "omit the column from SET" trick). `confirmed` is sticky
// (OR'd, not overwritten) for the same reason: a fresh clusterVisits()
// result always has confirmed: false.
function mergeRescannedVisit(incoming: Visit, existing: Visit | null): Visit {
  if (!existing) return incoming;
  return {
    ...incoming,
    place: existing.place,
    photoIds: existing.photoIds,
    startedAt: existing.startedAt,
    endedAt: existing.endedAt,
    transcript: incoming.transcript ?? existing.transcript,
    notes: incoming.notes ?? existing.notes,
    rating: incoming.rating ?? existing.rating,
    tags: incoming.tags ?? existing.tags,
    confirmed: incoming.confirmed || existing.confirmed,
    photoCaptions: incoming.photoCaptions ?? existing.photoCaptions,
  };
}

/**
 * Used only by JourneyScreen.runScan's re-detection loop. clusterVisits()
 * always produces a Visit with no journal fields at all, so a plain
 * upsertVisit here would silently wipe an existing journal entry - this
 * merges against any existing row first. See mergeRescannedVisit.
 */
export function upsertScannedVisit(visit: Visit) {
  if (!db) {
    const merged = mergeRescannedVisit(visit, memoryVisits.get(visit.id) ?? null);
    memoryVisits.set(visit.id, merged);
    return;
  }
  db.withTransactionSync(() => {
    const row = db.getFirstSync<any>(`SELECT * FROM visits WHERE id = ?;`, [
      visit.id,
    ]);
    const merged = mergeRescannedVisit(visit, row ? rowToVisit(row) : null);
    writeVisitRow(db, merged);
  });
}

/**
 * Deletes a visit the user marked as wrong (JourneyScreen's remove button).
 * Same delete+FTS-cleanup shape as the id-changing branch of
 * updateVisitPlace above. Callers pair this with excludePhotos(visit.
 * photoIds) so the underlying photos don't just re-form the same visit on
 * the next scan - see that function's comment.
 */
export function deleteVisit(visitId: string): void {
  if (!db) {
    memoryVisits.delete(visitId);
    return;
  }
  db.withTransactionSync(() => {
    db.runSync(`DELETE FROM visits WHERE id = ?;`, [visitId]);
    db.runSync(`DELETE FROM visits_fts WHERE visitId = ?;`, [visitId]);
  });
}

/**
 * Marks photo ids as permanently excluded from future scans - used when
 * the user removes a visit they didn't actually make (JourneyScreen).
 * Excluding by photo id rather than by visit id means these photos can't
 * silently re-form a *different* visit at a different place either; a
 * visit-id block would only stop the exact same cluster-to-place
 * resolution from recurring.
 */
export function excludePhotos(photoIds: string[]): void {
  if (!db) {
    photoIds.forEach((id) => memoryExcludedPhotoIds.add(id));
    return;
  }
  db.withTransactionSync(() => {
    for (const id of photoIds) {
      db.runSync(`INSERT OR IGNORE INTO excluded_photos (photoId) VALUES (?);`, [id]);
    }
  });
}

/**
 * All excluded photo ids, for JourneyScreen.runScan to filter out of a
 * fresh extractPhotoMetadata() result before clusterVisits ever sees them.
 */
export function getExcludedPhotoIds(): Set<string> {
  if (!db) {
    return new Set(memoryExcludedPhotoIds);
  }
  const rows = db.getAllSync<{ photoId: string }>(
    `SELECT photoId FROM excluded_photos;`
  );
  return new Set(rows.map((r) => r.photoId));
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
  const tokens = tokenize(query)
    .map((t) => t.replace(/"/g, ""))
    .filter(Boolean);
  if (tokens.length === 0) return null;
  return tokens.map((t) => `"${t}"`).join(" OR ");
}

// Shared by the native FTS5 query builder and the web keyword-overlap
// fallback below - both need "split into meaningful words", they just do
// different things with the result afterwards.
function tokenize(query: string): string[] {
  return query.split(/\s+/).filter(Boolean);
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
    const tokens = tokenize(query.toLowerCase());
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

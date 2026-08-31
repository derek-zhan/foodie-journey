# Foodie Journey

Iteration 1: detect restaurant visits from geotagged photos, journal them by
voice, and browse them as a diary. No posting to Google Maps/Yelp yet — that's
phase 2.

## Pipeline

```
Phone photo library
  → EXIF extraction (GPS + timestamp)
  → Places API lookup (reverse geocode to restaurant)
  → Visit clustering (group nearby photos in time)
  → Voice journal (LLM structuring of a transcript into notes/tags/rating)
  → Local diary storage (SQLite, timeline UI)
  → Ask the diary (RAG: embed + retrieve journaled visits, Claude answers)
```

Each stage lives in `src/pipeline/`:
- `extractPhotoMetadata.ts` — reads the device photo library via `expo-media-library`
- `resolvePlace.ts` — calls Google Places API (Nearby Search) to resolve coordinates to a restaurant
- `clusterVisits.ts` — groups photos into discrete visits by time + distance proximity
- `journalVisit.ts` — turns a transcript into structured notes/tags/rating via the Claude API

RAG (semantic search over the diary) lives in `src/rag/`:
- `embeddings.ts` — embeds text via the Voyage AI API, plus cosine similarity
- `searchDiary.ts` — retrieves the most relevant journaled visits for a query and has Claude answer from them

Storage: `src/db/visitStore.ts` (visits) + `src/db/embeddingStore.ts` (per-visit embeddings), both SQLite via `expo-sqlite`
UI: `src/screens/DiaryScreen.tsx` (timeline + journal entry) and `src/screens/AskDiaryScreen.tsx` (ask the diary), switched via a tab bar in `App.tsx`

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and add:
   - a Google Places API key (enable "Places API (New)" in Google Cloud Console)
   - an Anthropic API key (for journal structuring and diary Q&A)
   - a Voyage AI API key (for diary search embeddings)
3. `npm start` — then open in Expo Go on your phone, or run `npm run ios` / `npm run android`

Note: all three keys are `EXPO_PUBLIC_*` and ship inside the client bundle —
fine for this exploratory build, not for a distributed app (would need a
backend proxy).

## Not yet built

- Voice *capture* (speech-to-text) — journaling currently takes pasted/typed
  transcript text; the LLM-structuring half is wired up
- Manual "confirm this visit" UI to correct misresolved places
- Posting drafted reviews to Google Maps / Yelp / OpenTable (phase 2)

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

Foodie Journey (Expo/React Native, TypeScript). Iteration 1 goal: detect
restaurant visits from geotagged photos and browse them as a diary. No
posting to Google Maps/Yelp yet (that's phase 2). See README.md for the
full pipeline description and current build status.

## Commands

- `npm install` — install dependencies
- `npm start` — start the Expo dev server (then open in Expo Go, or press i/a/w)
- `npm run ios` / `npm run android` / `npm run web` — start and target a platform directly

There is no lint or test tooling configured in this repo yet (no eslint,
jest, or prettier config present) — don't assume `npm test` or `npm run
lint` exist.

Environment: copy `.env.example` to `.env` and set
`EXPO_PUBLIC_GOOGLE_PLACES_API_KEY` (requires "Places API (New)" enabled in
Google Cloud Console). Without it, `resolvePlace` throws immediately.

## Architecture

Single linear pipeline, each stage a pure-ish async function in
`src/pipeline/`, wired together and persisted from `src/screens/DiaryScreen.tsx`:

```
extractPhotoMetadata (src/pipeline/extractPhotoMetadata.ts)
  → reads device photo library via expo-media-library, paginated,
    filters to geotagged photos only, returns PhotoAsset[] sorted by time

clusterVisits (src/pipeline/clusterVisits.ts)
  → groups PhotoAsset[] into visits using two thresholds: MAX_GAP_MINUTES
    (90) and MAX_DISTANCE_METERS (150, haversine). For each cluster it
    calls resolvePlace on the centroid; clusters that don't resolve to a
    food place are dropped (e.g. photos taken at home)

resolvePlace (src/pipeline/resolvePlace.ts)
  → Google Places API "searchNearby" (New), restricted to FOOD_PLACE_TYPES
    (restaurant/cafe/bar/bakery/meal_takeaway/meal_delivery), 75m radius
    to absorb GPS drift. Returns null (not an error) when nothing food-
    related is nearby — clusterVisits relies on this to filter non-visits

visitStore (src/db/visitStore.ts)
  → SQLite (expo-sqlite, synchronous API). initDb() creates the table if
    missing; upsertVisit does INSERT ... ON CONFLICT DO UPDATE, but the
    update clause only touches the user-editable fields (transcript,
    notes, rating, tags, confirmed) — place/photo/time fields are
    write-once per visit id. Visit ids are `${placeId}-${firstPhotoTimestamp}`,
    and listVisits() reverse-engineers placeId from that composite id
    rather than storing it separately — keep that in sync if the id
    format ever changes
```

`Visit` and its sub-types (`PhotoAsset`, `ResolvedPlace`) are the shared
data model, defined once in `src/types/index.ts`.

`DiaryScreen` is currently the app's only screen (`App.tsx` renders it
directly, no navigation library yet). It drives the whole pipeline
end-to-end on a button press, hardcoded to the last 7 days.

### Not yet built (see README.md for details)

- Voice journal capture (speech-to-text + LLM notes) — `Visit.transcript`/
  `notes` exist in the schema but nothing populates them yet
- Manual "confirm this visit" / correction UI — `Visit.confirmed` exists
  but is never set true
- Posting drafted reviews externally (phase 2)

## Working in this codebase

- Expo APIs move fast between major versions — **read
  https://docs.expo.dev/versions/v57.0.0/ before writing Expo-related code**
  rather than relying on training data (this is the point of the
  `@AGENTS.md` import above).
- `tsconfig.json` has `strict: true` — keep new code strict-clean.
- Never commit a real Google Places API key; `.env` is gitignored, only
  `.env.example` should be tracked.

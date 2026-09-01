// Populates process.env.EXPO_PUBLIC_* from .env before tests run, using the
// same loader (@expo/env, a transitive dep of `expo`) that `expo start`/
// `scripts/webDev.js` use for the app itself. Without this, Jest's plain
// Node process never reads .env at all - the functional tests would always
// see EXPO_PUBLIC_* as unset regardless of what's actually configured,
// silently forcing e.g. resolvePlace.ts onto its OSM fallback path even
// with a real Google key present.
require("@expo/env").load(__dirname);

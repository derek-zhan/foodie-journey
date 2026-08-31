const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// expo-sqlite's web backend (wa-sqlite compiled to WASM) needs the .wasm
// file resolvable as an asset - without this, bundling the worker fails
// outright. The other half of web SQLite support (cross-origin isolation
// headers) can't be done from metro.config.js in this Expo/Metro version -
// see scripts/webDev.js.
config.resolver.assetExts.push("wasm");

module.exports = config;

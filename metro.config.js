const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// expo-sqlite's web backend (wa-sqlite compiled to WASM) needs the .wasm
// file resolvable as an asset - without this, bundling the worker fails
// outright. The other half of web SQLite support (cross-origin isolation
// headers) can't be done from metro.config.js in this Expo/Metro version -
// see scripts/webDev.js.
config.resolver.assetExts.push("wasm");

// @anthropic-ai/sdk has Node-only code paths (Bedrock/Vertex credential
// file caching, file-upload streaming helpers) gated behind dynamic
// `import('node:*')` calls. This app only does plain API-key auth
// (journalVisit.ts, searchJourney.ts) so those paths never execute, but
// Metro still statically resolves every import() target when building the
// dependency graph, and RN has no node:fs/node:crypto/etc. - so bundling
// fails outright unless these are treated as empty modules.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith("node:")) {
    return { type: "empty" };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;

module.exports = {
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
  // Expo's env-var inlining (part of babel-preset-expo, used via
  // babel.config.js) pulls in node_modules/expo/virtual/env.js, a real but
  // ESM-syntax file - Jest's default transformIgnorePatterns skips all of
  // node_modules, so without this carve-out that file never gets converted
  // to CommonJS and require() fails outright.
  transformIgnorePatterns: ["node_modules/(?!(expo)/)"],
};

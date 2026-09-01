// Standard Expo root babel config (this project was missing one - Metro's
// zero-config default was covering for it at bundle time, but Jest needs
// one explicitly to transform TS/JSX via babel-jest).
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
  };
};

module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Drizzle migrations are bundled as .sql files.
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};

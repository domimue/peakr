const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Drizzle migrations are bundled as .sql files.
config.resolver.sourceExts.push('sql');

module.exports = config;

// Free EAS workers have little memory: compiling every native module (Reanimated, Skia,
// MapLibre, Expo core …) in parallel gets the Gradle daemon killed or stalls the build. With
// PEAKR_LOW_MEMORY_BUILD=1 (eas.json: personal and development) Gradle runs at most two tasks at
// a time and modules one after the other; store builds keep the defaults.
const { withGradleProperties } = require('expo/config-plugins');

const LIMITS = {
  'org.gradle.parallel': 'false',
  'org.gradle.workers.max': '2',
  'org.gradle.jvmargs': '-Xmx3072m -XX:MaxMetaspaceSize=768m',
};

module.exports = function withBuildLimits(config) {
  if (process.env.PEAKR_LOW_MEMORY_BUILD !== '1') return config;
  return withGradleProperties(config, (cfg) => {
    for (const [key, value] of Object.entries(LIMITS)) {
      const item = cfg.modResults.find((p) => p.type === 'property' && p.key === key);
      if (item) item.value = value;
      else cfg.modResults.push({ type: 'property', key, value });
    }
    return cfg;
  });
};

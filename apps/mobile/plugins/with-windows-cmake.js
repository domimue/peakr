// Windows only: the SDK's default CMake 3.22.1 ships Ninja 1.10, which cannot handle paths
// over 260 characters, and the React Native codegen object paths exceed that. Newer CMake
// (Ninja >= 1.12) works when Windows long paths are enabled (LongPathsEnabled = 1).
// CMake 4 refuses projects declaring cmake_minimum_required < 3.5 (e.g. react-native-skia),
// so the policy minimum is raised for every native module as well.
// macOS/Linux builds (incl. EAS) keep the default CMake version.
const { withSettingsGradle } = require('expo/config-plugins');

const PREFIX = '// @generated peakr-windows-cmake';
const MARKER = `${PREFIX} v2`;

module.exports = function withWindowsCmake(config, { version = '4.1.2' } = {}) {
  return withSettingsGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy' || cfg.modResults.contents.includes(MARKER)) {
      return cfg;
    }
    // An older version of this block (always appended last) is replaced.
    const old = cfg.modResults.contents.indexOf(PREFIX);
    const contents =
      old === -1 ? cfg.modResults.contents : cfg.modResults.contents.slice(0, old).trimEnd();
    // Registered in settings.gradle so it runs before any Android module is evaluated.
    cfg.modResults.contents = `${contents}
${MARKER}
if (System.getProperty('os.name').toLowerCase().contains('windows')) {
  gradle.beforeProject { project ->
    def cmakeVersion = project.findProperty('peakr.windowsCmakeVersion') ?: '${version}'
    ['com.android.application', 'com.android.library'].each { pluginId ->
      project.plugins.withId(pluginId) {
        project.android.externalNativeBuild.cmake.version = cmakeVersion
        project.android.defaultConfig.externalNativeBuild.cmake.arguments(
          '-DCMAKE_POLICY_VERSION_MINIMUM=3.5'
        )
      }
    }
  }
}
`;
    return cfg;
  });
};

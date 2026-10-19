/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // Reanimated 4 / Worklets: resolve their web implementations instead of native modules.
  resolver: 'react-native-reanimated/jest/resolver',
  setupFiles: ['react-native-gesture-handler/jestSetup.js', '<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    // Gesture Handler 3 installs UI-runtime bindings on import – not available under Jest.
    '^\\./installUIRuntimeBindings$': '<rootDir>/src/test-utils/gesture-handler-ui-runtime.ts',
  },
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/'],
};

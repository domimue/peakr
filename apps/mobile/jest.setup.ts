import { setUpTests } from 'react-native-reanimated';

// Initialise i18next once for every test file.
import '@/i18n';

setUpTests();

// Skia / victory-native need the native canvas; charts render as nothing under Jest.
jest.mock('victory-native', () => ({
  CartesianChart: () => null,
  Bar: () => null,
  Area: () => null,
  Line: () => null,
}));

// MapLibre is native-only; without a map style key the app shows the tile-less route shape anyway.
jest.mock('@maplibre/maplibre-react-native', () => ({
  Map: () => null,
  Camera: () => null,
  GeoJSONSource: () => null,
  Layer: () => null,
}));
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(() => Promise.resolve({ canceled: true, assets: null })),
}));
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({ text: jest.fn(() => Promise.resolve('')) })),
  Paths: { cache: 'cache' },
}));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('@shopify/react-native-skia', () => ({
  DashPathEffect: () => null,
  Line: () => null,
  vec: (x: number, y: number) => ({ x, y }),
}));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));

// Push notifications and background tasks are native-only.
jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
  BackgroundNotificationTaskResult: { NewData: 0, NoData: 1, Failed: 2 },
  getPermissionsAsync: jest.fn(() => Promise.resolve({ granted: false, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ granted: false })),
  getExpoPushTokenAsync: jest.fn(() => Promise.resolve({ data: 'ExponentPushToken[test]' })),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve(null)),
  setNotificationHandler: jest.fn(),
  registerTaskAsync: jest.fn(() => Promise.resolve()),
  SchedulableTriggerInputTypes: { DATE: 'date' },
  getAllScheduledNotificationsAsync: jest.fn(() => Promise.resolve([])),
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve()),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('id')),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));

// Weather settings and the cached forecast live in SQLite; every test gets the in-memory version.
jest.mock('@/data/repositories/weather-repository');

// Location is native-only; tests set the permission answer and the position per case.
jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(() => Promise.resolve({ granted: false })),
  getForegroundPermissionsAsync: jest.fn(() => Promise.resolve({ granted: false })),
  getLastKnownPositionAsync: jest.fn(() => Promise.resolve(null)),
  getCurrentPositionAsync: jest.fn(() =>
    Promise.resolve({ coords: { latitude: 47.3769, longitude: 8.5417 }, timestamp: 0 }),
  ),
}));

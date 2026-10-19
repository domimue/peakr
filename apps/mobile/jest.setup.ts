import { setUpTests } from 'react-native-reanimated';

// Initialise i18next once for every test file.
import '@/i18n';

setUpTests();

// Skia / victory-native need the native canvas; charts render as nothing under Jest.
jest.mock('victory-native', () => ({
  CartesianChart: () => null,
  Bar: () => null,
}));
jest.mock('@shopify/react-native-skia', () => ({
  DashPathEffect: () => null,
  Line: () => null,
  vec: (x: number, y: number) => ({ x, y }),
}));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

// Push notifications and background tasks are native-only.
jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 3 },
  BackgroundNotificationTaskResult: { NewData: 0, NoData: 1, Failed: 2 },
  getPermissionsAsync: jest.fn(() => Promise.resolve({ granted: false, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ granted: false })),
  getExpoPushTokenAsync: jest.fn(() => Promise.resolve({ data: 'ExponentPushToken[test]' })),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve(null)),
  setNotificationHandler: jest.fn(),
  registerTaskAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));

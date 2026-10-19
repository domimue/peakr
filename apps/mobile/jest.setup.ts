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

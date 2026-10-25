import Constants from 'expo-constants';

/**
 * Personal build (EAS profile `personal`, set in app.config.ts): a standalone APK for the owner's
 * own use before billing exists – training and the Gym add-on are unlocked without a purchase.
 * Never true in a production build or in Expo Go / `expo start` (docs/personal-build.md).
 */
export const personalBuild =
  (Constants.expoConfig?.extra as { personalBuild?: unknown } | undefined)?.personalBuild === true;

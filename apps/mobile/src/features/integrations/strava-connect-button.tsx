import { Image, Pressable, StyleSheet } from 'react-native';

export interface StravaConnectButtonProps {
  /** Accessible name, e.g. "Connect with Strava". */
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}

/**
 * The official "Connect with Strava" button (Strava API Brand Guidelines 1.1, orange, 48 px high),
 * used unchanged as Strava supplies it – never rebuilt in our own style. It starts the OAuth flow
 * at strava.com/oauth/mobile/authorize, as the guidelines require.
 */
export function StravaConnectButton({
  label,
  onPress,
  disabled,
  testID,
}: StravaConnectButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      testID={testID}
      style={({ pressed }) => [styles.button, (pressed || disabled) && styles.dimmed]}
    >
      <Image
        source={require('../../../assets/strava/btn_strava_connect_with_orange.png')}
        style={styles.image}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignSelf: 'center' },
  dimmed: { opacity: 0.6 },
  image: { width: 237, height: 48 },
});

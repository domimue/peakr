import type { ReactNode } from 'react';
import Animated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';

import { spacing } from '../theme';

export interface RevealProps {
  children: ReactNode;
}

/**
 * Subtle fade + slide-in for results when they first appear.
 * Reanimated layout animations follow the system "reduce motion" setting by default.
 */
export function Reveal({ children }: RevealProps) {
  return (
    <Animated.View
      entering={FadeInDown.duration(280)}
      exiting={FadeOut.duration(150)}
      layout={LinearTransition.duration(200)}
      style={{ gap: spacing.md }}
    >
      {children}
    </Animated.View>
  );
}

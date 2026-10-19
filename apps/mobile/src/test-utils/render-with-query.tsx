import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

/**
 * Renders with a fresh query client (no retries, no cache shared between tests) inside a gesture
 * root view, like the app root layout.
 */
export function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  return render(
    <GestureHandlerRootView>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </GestureHandlerRootView>,
  );
}

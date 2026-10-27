import { Redirect } from 'expo-router';

import { isEnabled } from '@/config/feature-flags';
import { HealthDiagnosticsScreen } from '@/features/insights/health/diagnostics-screen';

/** Developer flag `healthDiagnostics` only (on in the personal build). */
export default function HealthDiagnosticsRoute() {
  if (!isEnabled('healthDiagnostics')) return <Redirect href="/health/consent" />;
  return <HealthDiagnosticsScreen />;
}

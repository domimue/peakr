import { InsightsScreen } from '@/features/insights/insights-screen';

/** Insights as a screen (Profile, Today) – the tab slot belongs to Body while it is switched on. */
export default function InsightsRoute() {
  return <InsightsScreen inStack />;
}

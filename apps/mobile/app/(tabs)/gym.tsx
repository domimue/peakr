import { useHasGym } from '@/features/billing/billing-store';
import { GymPreviewScreen } from '@/features/billing/screens/gym-preview-screen';
import { GymScreen } from '@/features/gym/gym-screen';

/** The tab is always visible; without the `gym` entitlement it shows the preview and paywall. */
export default function GymTab() {
  return useHasGym() ? <GymScreen /> : <GymPreviewScreen />;
}

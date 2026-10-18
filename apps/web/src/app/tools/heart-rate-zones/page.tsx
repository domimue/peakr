import { HrZonesCalculator } from '@/features/tools/calculators/hr-zones-calculator';
import { ToolPage, toolMetadata } from '@/features/tools/tool-page';

export const metadata = toolMetadata('hrZones');

export default function HeartRateZonesPage() {
  return (
    <ToolPage toolKey="hrZones">
      <HrZonesCalculator />
    </ToolPage>
  );
}

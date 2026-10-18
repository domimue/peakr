import { PaceCalculator } from '@/features/tools/calculators/pace-calculator';
import { ToolPage, toolMetadata } from '@/features/tools/tool-page';

export const metadata = toolMetadata('pace');

export default function PacePage() {
  return (
    <ToolPage toolKey="pace">
      <PaceCalculator />
    </ToolPage>
  );
}

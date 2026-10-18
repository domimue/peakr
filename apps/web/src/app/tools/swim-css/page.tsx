import { SwimCssCalculator } from '@/features/tools/calculators/swim-css-calculator';
import { Card } from '@/features/tools/components/result';
import { ToolPage, toolMetadata } from '@/features/tools/tool-page';
import { messages } from '@/i18n';

export const metadata = toolMetadata('swim');

const t = messages.tools.swim;
const GUIDE_STEPS = ['warmUp', 'swim400', 'recover', 'swim200', 'record'] as const;

export default function SwimCssPage() {
  return (
    <ToolPage
      toolKey="swim"
      intro={
        <Card>
          <h2 className="text-lg font-semibold">{t.guideTitle}</h2>
          <ol className="flex list-decimal flex-col gap-2 pl-5">
            {GUIDE_STEPS.map((step) => (
              <li key={step}>{t.guide[step]}</li>
            ))}
          </ol>
        </Card>
      }
    >
      <SwimCssCalculator />
    </ToolPage>
  );
}

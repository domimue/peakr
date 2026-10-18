import { Zone2Calculator } from '@/features/tools/calculators/zone2-calculator';
import { Card } from '@/features/tools/components/result';
import { ToolPage, toolMetadata } from '@/features/tools/tool-page';
import { messages } from '@/i18n';

export const metadata = toolMetadata('zone2');

const t = messages.tools.zone2;
const BENEFITS = ['base', 'fat', 'recovery', 'volume'] as const;

export default function Zone2Page() {
  return (
    <ToolPage
      toolKey="zone2"
      intro={
        <Card>
          <h2 className="text-lg font-semibold">{t.whyTitle}</h2>
          <ul className="flex list-disc flex-col gap-2 pl-5">
            {BENEFITS.map((key) => (
              <li key={key}>{t.benefits[key]}</li>
            ))}
          </ul>
        </Card>
      }
    >
      <Zone2Calculator />
    </ToolPage>
  );
}

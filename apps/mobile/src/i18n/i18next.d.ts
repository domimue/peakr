import 'i18next';

import type { defaultNS, resources } from './index';

// Makes t('...') keys type-checked against locales/en.json + @peakr/i18n plan.json.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS;
    resources: (typeof resources)['en'];
  }
}

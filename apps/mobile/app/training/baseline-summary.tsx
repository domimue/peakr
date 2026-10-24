import { BaselineSummaryScreen } from '@/features/baseline/screens/baseline-summary-screen';
import { withTraining } from '@/features/billing/locked';

function TrainingBaselineSummary() {
  return <BaselineSummaryScreen flow="recalibrate" />;
}

export default withTraining(TrainingBaselineSummary);

import { BaselineSelectScreen } from '@/features/baseline/screens/baseline-select-screen';
import { withTraining } from '@/features/billing/locked';

function TrainingBaseline() {
  return <BaselineSelectScreen flow="recalibrate" />;
}

export default withTraining(TrainingBaseline);

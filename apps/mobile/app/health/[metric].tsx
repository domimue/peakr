import { withTraining } from '@/features/billing/locked';
import { MetricDetailScreen } from '@/features/insights/health/metric-detail-screen';

export default withTraining(MetricDetailScreen, { allowReadOnly: true });

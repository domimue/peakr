import { withTraining } from '@/features/billing/locked';
import { ConnectionsScreen } from '@/features/integrations/screens/connections-screen';

function Connections() {
  return <ConnectionsScreen />;
}

export default withTraining(Connections);

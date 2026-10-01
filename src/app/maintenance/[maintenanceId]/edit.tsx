import { MaintenanceEditorScreen } from '@/components/maintenance/MaintenanceEditorScreen';
import { useLocalSearchParams } from 'expo-router';

export default function EditMaintenanceScreen() {
  const params = useLocalSearchParams<{ maintenanceId: string }>();
  return (
    <MaintenanceEditorScreen
      maintenanceId={String(params.maintenanceId || '')}
    />
  );
}

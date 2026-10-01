import { MaintenanceEditorScreen } from '@/components/maintenance/MaintenanceEditorScreen';
import { useLocalSearchParams } from 'expo-router';

export default function EditMaintenanceScreen() {
  const params = useLocalSearchParams<{ maintenanceId: string }>();
  return (
    <MaintenanceEditorScreen
      mode="edit"
      maintenanceId={String(params.maintenanceId || '')}
    />
  );
}

import { DeviceEditorScreen } from '@/components/maintenance/DeviceEditorScreen';
import { useLocalSearchParams } from 'expo-router';

export default function NewDeviceScreen() {
  const params = useLocalSearchParams<{ maintenanceId: string }>();
  return (
    <DeviceEditorScreen
      mode="create"
      maintenanceId={String(params.maintenanceId || '')}
    />
  );
}

import { DeviceEditorScreen } from '@/components/maintenance/DeviceEditorScreen';
import { useLocalSearchParams } from 'expo-router';

export default function EditDeviceScreen() {
  const params = useLocalSearchParams<{
    maintenanceId: string;
    deviceId: string;
  }>();
  return (
    <DeviceEditorScreen
      mode="edit"
      maintenanceId={String(params.maintenanceId || '')}
      deviceId={String(params.deviceId || '')}
    />
  );
}

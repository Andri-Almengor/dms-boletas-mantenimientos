import { DeviceEditorScreen } from '@/components/maintenance/DeviceEditorScreen';
import { useLocalSearchParams } from 'expo-router';

export default function NewDeviceScreen() {
  const params = useLocalSearchParams<{
    maintenanceId: string;
    equipmentLocationId?: string;
    equipmentLocationName?: string;
  }>();

  return (
    <DeviceEditorScreen
      mode="create"
      maintenanceId={String(params.maintenanceId || '')}
      initialEquipmentLocationId={String(params.equipmentLocationId || '')}
      initialEquipmentLocationName={String(params.equipmentLocationName || '')}
    />
  );
}

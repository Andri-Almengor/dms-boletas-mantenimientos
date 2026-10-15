import {
  createDeviceEditorForm,
  deviceEditorPayload,
} from '@/features/maintenance/maintenanceEditorDomain';
import { createLocalId } from '@/utils/localId';

export const MAX_BULK_MAINTENANCE_DEVICES = 100;

// Mismo contrato de la web: admite pegado desde Excel y líneas independientes.
// Los nombres duplicados se conservan; cada dispositivo recibe su propio ID.
export function parseBulkMaintenanceDeviceNames(value: unknown): string[] {
  return String(value ?? '')
    .split(/[\t\r\n]+/)
    .map((name) => name.trim())
    .filter(Boolean);
}

export type BulkDeviceType = {
  key: string;
  typeId: string;
};

export type BulkDeviceLocation = {
  id: string;
  name: string;
};

export function buildBulkMaintenanceDevicePayloads(input: {
  names: string[];
  maintenanceId: string;
  maintenanceType: unknown;
  type: BulkDeviceType;
  location: BulkDeviceLocation;
  technicianIds: string[];
  projectChecklist: unknown;
}) {
  const {
    names, maintenanceId, maintenanceType, type, location,
    technicianIds, projectChecklist,
  } = input;

  if (!maintenanceId || !type.key || !location.id || !location.name) {
    throw new Error('Seleccione el tipo y la ubicación del equipo.');
  }
  if (!names.length || names.length > MAX_BULK_MAINTENANCE_DEVICES
    || names.some((name) => !name.trim())) {
    throw new Error('Ingrese entre 1 y 100 nombres válidos.');
  }

  return names.map((name) => {
    // Reutiliza exactamente el modelo y la serialización del editor individual.
    // Las respuestas y el progreso quedan pendientes hasta la edición posterior.
    const form = {
      ...createDeviceEditorForm(maintenanceType),
      id: createLocalId('dispositivo'),
      equipmentLocationId: location.id,
      equipmentLocationName: location.name,
      deviceTypeId: type.typeId,
      category: type.key,
      name: name.trim(),
      technicianIds,
      status: 'PENDIENTE',
    };
    return deviceEditorPayload(
      form,
      maintenanceId,
      [],
      projectChecklist,
    );
  });
}

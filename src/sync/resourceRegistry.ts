export const CLIENT_SYNC_SCHEMA_VERSION = 2;
export const SNAPSHOT_PAGE_SIZE = 1000;

export type DeltaResourceConfig = {
  resource: string;
  route: string;
  localResource?: string;
  optional?: boolean;
};

export const DELTA_RESOURCES: DeltaResourceConfig[] = [
  { resource: 'maintenance', route: 'maintenance.list' },
  { resource: 'client', route: 'clients.list' },
  { resource: 'clientLocation', route: 'clientLocations.list' },
  { resource: 'equipmentLocation', route: 'equipmentLocations.list' },
  { resource: 'contact', route: 'contacts.list' },
  { resource: 'catalogCategory', route: 'catalog.categories.list' },
  { resource: 'deviceType', route: 'catalog.deviceTypes.list' },
  { resource: 'manufacturer', route: 'catalog.manufacturers.list' },
  { resource: 'model', route: 'catalog.models.list' },
  { resource: 'failureType', route: 'catalog.failureTypes.list' },
  { resource: 'deviceManufacturerRelation', route: 'catalog.deviceManufacturers.list' },
];

export const STATIC_RESOURCES = [
  { resource: 'assignableUser', route: 'users.assignment.list', optional: false },
  { resource: 'maintenanceQuestion', route: 'maintenance.questions.list', optional: true },
] as const;

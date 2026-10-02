export const CLIENT_SYNC_SCHEMA_VERSION = 2;
export const SNAPSHOT_PAGE_SIZE = 1000;

export type DeltaResourceConfig = {
  resource: string;
  route: string;
  localResource?: string;
  optional?: boolean;
  /**
   * Algunos endpoints operativos (maintenance.list) ya aplican su propia
   * política de visibilidad/Activo. No debemos endurecerla desde el móvil.
   */
  forceActiveFilter?: boolean;
};

export const DELTA_RESOURCES: DeltaResourceConfig[] = [
  {
    resource: 'maintenance',
    route: 'maintenance.list',
    forceActiveFilter: false,
  },
  { resource: 'client', route: 'clients.list', forceActiveFilter: true },
  { resource: 'clientLocation', route: 'clientLocations.list', forceActiveFilter: true },
  { resource: 'equipmentLocation', route: 'equipmentLocations.list', forceActiveFilter: true },
  { resource: 'contact', route: 'contacts.list', forceActiveFilter: true },
  { resource: 'catalogCategory', route: 'catalog.categories.list', forceActiveFilter: true },
  { resource: 'deviceType', route: 'catalog.deviceTypes.list', forceActiveFilter: true },
  { resource: 'manufacturer', route: 'catalog.manufacturers.list', forceActiveFilter: true },
  { resource: 'model', route: 'catalog.models.list', forceActiveFilter: true },
  { resource: 'failureType', route: 'catalog.failureTypes.list', forceActiveFilter: true },
  { resource: 'deviceManufacturerRelation', route: 'catalog.deviceManufacturers.list', forceActiveFilter: true },
];

export const STATIC_RESOURCES = [
  { resource: 'assignableUser', route: 'users.assignment.list', optional: false },
  { resource: 'maintenanceQuestion', route: 'maintenance.questions.list', optional: true },
] as const;

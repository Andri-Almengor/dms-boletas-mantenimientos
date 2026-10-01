export const LOCAL_SCHEMA_VERSION = 4;

export type LocalMigration = {
  version: number;
  sql: string;
};

const MIGRATION_1 = String.raw`
CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

const MIGRATION_2 = String.raw`
CREATE TABLE IF NOT EXISTS local_maintenances (
  scope_key TEXT NOT NULL,
  maintenance_id TEXT NOT NULL,
  maintenance_type TEXT NOT NULL DEFAULT 'MANTENIMIENTO',
  status TEXT NOT NULL DEFAULT 'PENDIENTE',
  client_id TEXT NOT NULL DEFAULT '',
  client_name TEXT NOT NULL DEFAULT '',
  location_id TEXT NOT NULL DEFAULT '',
  location_name TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  maintenance_date TEXT NOT NULL DEFAULT '',
  finalization_date TEXT NOT NULL DEFAULT '',
  responsible_ids_json TEXT NOT NULL DEFAULT '[]',
  payload_json TEXT NOT NULL DEFAULT '{}',
  sync_status TEXT NOT NULL DEFAULT 'SYNCED',
  server_updated_at TEXT NOT NULL DEFAULT '',
  local_updated_at TEXT NOT NULL,
  last_synced_at TEXT NOT NULL DEFAULT '',
  tombstone INTEGER NOT NULL DEFAULT 0 CHECK (tombstone IN (0, 1)),
  PRIMARY KEY (scope_key, maintenance_id)
);

CREATE INDEX IF NOT EXISTS ix_local_maintenances_scope_status_date
  ON local_maintenances (scope_key, status, maintenance_date DESC);
CREATE INDEX IF NOT EXISTS ix_local_maintenances_scope_client
  ON local_maintenances (scope_key, client_id);
CREATE INDEX IF NOT EXISTS ix_local_maintenances_scope_sync
  ON local_maintenances (scope_key, sync_status);

CREATE TABLE IF NOT EXISTS local_maintenance_devices (
  scope_key TEXT NOT NULL,
  device_id TEXT NOT NULL,
  maintenance_id TEXT NOT NULL,
  equipment_location_id TEXT NOT NULL DEFAULT '',
  equipment_location_name TEXT NOT NULL DEFAULT '',
  zone TEXT NOT NULL DEFAULT '',
  device_type_id TEXT NOT NULL DEFAULT '',
  device_type_name TEXT NOT NULL DEFAULT '',
  manufacturer_id TEXT NOT NULL DEFAULT '',
  manufacturer_name TEXT NOT NULL DEFAULT '',
  model_id TEXT NOT NULL DEFAULT '',
  model_name TEXT NOT NULL DEFAULT '',
  device_name TEXT NOT NULL DEFAULT '',
  serial_number TEXT NOT NULL DEFAULT '',
  mac_address TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  work_date TEXT NOT NULL DEFAULT '',
  technician_ids_json TEXT NOT NULL DEFAULT '[]',
  payload_json TEXT NOT NULL DEFAULT '{}',
  sync_status TEXT NOT NULL DEFAULT 'SYNCED',
  server_updated_at TEXT NOT NULL DEFAULT '',
  local_updated_at TEXT NOT NULL,
  last_synced_at TEXT NOT NULL DEFAULT '',
  tombstone INTEGER NOT NULL DEFAULT 0 CHECK (tombstone IN (0, 1)),
  PRIMARY KEY (scope_key, device_id),
  FOREIGN KEY (scope_key, maintenance_id)
    REFERENCES local_maintenances (scope_key, maintenance_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_local_devices_scope_maintenance
  ON local_maintenance_devices (scope_key, maintenance_id, tombstone);
CREATE INDEX IF NOT EXISTS ix_local_devices_scope_type
  ON local_maintenance_devices (scope_key, device_type_id);
CREATE INDEX IF NOT EXISTS ix_local_devices_scope_sync
  ON local_maintenance_devices (scope_key, sync_status);

CREATE TABLE IF NOT EXISTS local_files (
  file_id TEXT PRIMARY KEY NOT NULL,
  scope_key TEXT NOT NULL,
  owner_type TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  local_uri TEXT NOT NULL,
  file_name TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT '',
  file_size INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_local_files_scope_owner
  ON local_files (scope_key, owner_type, owner_id);

CREATE TABLE IF NOT EXISTS local_maintenance_evidence (
  scope_key TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  maintenance_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  local_file_id TEXT NOT NULL DEFAULT '',
  evidence_type TEXT NOT NULL DEFAULT 'Antes',
  note TEXT NOT NULL DEFAULT '',
  evidence_context TEXT NOT NULL DEFAULT 'MANTENIMIENTO',
  captured_at TEXT NOT NULL DEFAULT '',
  project_target_type TEXT NOT NULL DEFAULT '',
  project_relation_key TEXT NOT NULL DEFAULT '',
  project_component_local_id TEXT NOT NULL DEFAULT '',
  project_component_type_id TEXT NOT NULL DEFAULT '',
  project_component_name TEXT NOT NULL DEFAULT '',
  media_type TEXT NOT NULL DEFAULT 'image',
  mime_type TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL DEFAULT '',
  drive_file_id TEXT NOT NULL DEFAULT '',
  drive_url TEXT NOT NULL DEFAULT '',
  preview_url TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '{}',
  sync_status TEXT NOT NULL DEFAULT 'SYNCED',
  server_updated_at TEXT NOT NULL DEFAULT '',
  local_updated_at TEXT NOT NULL,
  last_synced_at TEXT NOT NULL DEFAULT '',
  tombstone INTEGER NOT NULL DEFAULT 0 CHECK (tombstone IN (0, 1)),
  PRIMARY KEY (scope_key, evidence_id),
  FOREIGN KEY (scope_key, maintenance_id)
    REFERENCES local_maintenances (scope_key, maintenance_id)
    ON DELETE CASCADE,
  FOREIGN KEY (scope_key, device_id)
    REFERENCES local_maintenance_devices (scope_key, device_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_local_evidence_scope_device
  ON local_maintenance_evidence (scope_key, device_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS ix_local_evidence_scope_maintenance
  ON local_maintenance_evidence (scope_key, maintenance_id);
CREATE INDEX IF NOT EXISTS ix_local_evidence_scope_sync
  ON local_maintenance_evidence (scope_key, sync_status);

CREATE TABLE IF NOT EXISTS local_resource_items (
  scope_key TEXT NOT NULL,
  resource TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  parent_id TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '{}',
  server_updated_at TEXT NOT NULL DEFAULT '',
  cached_at TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  PRIMARY KEY (scope_key, resource, entity_id)
);

CREATE INDEX IF NOT EXISTS ix_local_resource_scope_resource
  ON local_resource_items (scope_key, resource, active, label);
CREATE INDEX IF NOT EXISTS ix_local_resource_scope_parent
  ON local_resource_items (scope_key, resource, parent_id);

CREATE TABLE IF NOT EXISTS sync_state (
  scope_key TEXT NOT NULL,
  resource TEXT NOT NULL,
  cursor INTEGER NOT NULL DEFAULT 0,
  generation TEXT NOT NULL DEFAULT '',
  schema_version INTEGER NOT NULL DEFAULT 0,
  cache_scope TEXT NOT NULL DEFAULT '',
  full_snapshot_required INTEGER NOT NULL DEFAULT 1 CHECK (full_snapshot_required IN (0, 1)),
  last_pull_at TEXT NOT NULL DEFAULT '',
  last_push_at TEXT NOT NULL DEFAULT '',
  last_success_at TEXT NOT NULL DEFAULT '',
  last_error_code TEXT NOT NULL DEFAULT '',
  last_error_message TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (scope_key, resource)
);

CREATE TABLE IF NOT EXISTS sync_outbox (
  row_id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_id TEXT NOT NULL UNIQUE,
  scope_key TEXT NOT NULL,
  mutation_id TEXT NOT NULL UNIQUE,
  dedupe_key TEXT NOT NULL DEFAULT '',
  operation_kind TEXT NOT NULL,
  route TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  aggregate_id TEXT NOT NULL DEFAULT '',
  local_file_id TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'PENDING',
  priority INTEGER NOT NULL DEFAULT 100,
  attempts INTEGER NOT NULL DEFAULT 0,
  depends_on_operation_id TEXT NOT NULL DEFAULT '',
  last_error_code TEXT NOT NULL DEFAULT '',
  last_error_message TEXT NOT NULL DEFAULT '',
  next_attempt_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS ix_sync_outbox_scope_ready
  ON sync_outbox (scope_key, status, priority, row_id);
CREATE INDEX IF NOT EXISTS ix_sync_outbox_scope_entity
  ON sync_outbox (scope_key, entity_type, entity_id, status);
CREATE INDEX IF NOT EXISTS ix_sync_outbox_scope_dedupe
  ON sync_outbox (scope_key, dedupe_key, status);
CREATE INDEX IF NOT EXISTS ix_sync_outbox_dependency
  ON sync_outbox (scope_key, depends_on_operation_id, status);

CREATE TABLE IF NOT EXISTS sync_conflicts (
  conflict_id TEXT PRIMARY KEY NOT NULL,
  scope_key TEXT NOT NULL,
  resource TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  aggregate_id TEXT NOT NULL DEFAULT '',
  local_payload_json TEXT NOT NULL DEFAULT '{}',
  remote_payload_json TEXT NOT NULL DEFAULT '{}',
  base_payload_json TEXT NOT NULL DEFAULT '{}',
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT NOT NULL DEFAULT '',
  resolution_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS ix_sync_conflicts_scope_status
  ON sync_conflicts (scope_key, status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_sync_conflicts_scope_entity
  ON sync_conflicts (scope_key, entity_type, entity_id, status);
`;

const MIGRATION_3 = String.raw`
CREATE TABLE IF NOT EXISTS sync_runtime_lock (
  lock_name TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  acquired_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_sync_runtime_lock_expiry
  ON sync_runtime_lock (expires_at);
`;

const MIGRATION_4 = String.raw`
CREATE TABLE IF NOT EXISTS local_maintenance_detail_state (
  scope_key TEXT NOT NULL,
  maintenance_id TEXT NOT NULL,
  complete INTEGER NOT NULL DEFAULT 0 CHECK (complete IN (0, 1)),
  downloaded_at TEXT NOT NULL DEFAULT '',
  server_updated_at TEXT NOT NULL DEFAULT '',
  device_count INTEGER NOT NULL DEFAULT 0,
  evidence_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (scope_key, maintenance_id),
  FOREIGN KEY (scope_key, maintenance_id)
    REFERENCES local_maintenances (scope_key, maintenance_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_local_maintenance_detail_scope_complete
  ON local_maintenance_detail_state (scope_key, complete, downloaded_at DESC);
`;

export const LOCAL_MIGRATIONS: LocalMigration[] = [
  { version: 1, sql: MIGRATION_1 },
  { version: 2, sql: MIGRATION_2 },
  { version: 3, sql: MIGRATION_3 },
  { version: 4, sql: MIGRATION_4 },
];

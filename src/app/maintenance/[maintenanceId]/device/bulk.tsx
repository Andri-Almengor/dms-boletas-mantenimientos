import { useAuth } from '@/auth/AuthProvider';
import { OptionSheet, OptionItem } from '@/components/forms/OptionSheet';
import { saveLocalDevicesBulk } from '@/db/deviceRepository';
import { readLocalMaintenanceDetail } from '@/db/maintenanceDetailRepository';
import {
  getLocalMaintenance,
  maintenanceEquipmentLocationsFromRecord,
} from '@/db/maintenanceRepository';
import { listResourceItems } from '@/db/resourceRepository';
import {
  selectedMaintenanceCategories,
} from '@/features/maintenance/maintenanceEditorDomain';
import {
  buildBulkMaintenanceDevicePayloads,
  MAX_BULK_MAINTENANCE_DEVICES,
  parseBulkMaintenanceDeviceNames,
} from '@/features/maintenance/maintenanceBulkDevices';
import {
  canonicalMaintenanceCategoryName,
  MAINTENANCE_CATEGORIES,
} from '@/features/maintenance/maintenanceCategories';
import {
  canEditMaintenance,
  maintenanceReadOnly,
} from '@/features/maintenance/maintenancePermissions';
import { useSync } from '@/sync/SyncProvider';
import { colors, radius, spacing } from '@/theme/tokens';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type RecordLike = Record<string, unknown>;
type TypeOption = OptionItem & { category: string; deviceTypeId: string };

function first(item: RecordLike, keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return '';
}

function objectFromJson(value: unknown): RecordLike {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as RecordLike;
  try {
    const parsed: unknown = JSON.parse(String(value || '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as RecordLike : {};
  } catch { return {}; }
}

function maintenanceCategoryCounts(maintenance: RecordLike): Record<string, number> {
  const raw = objectFromJson(maintenance.CantidadesJSON);
  const counts: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    counts[key] = Math.max(0, Number(value) || 0);
  }
  for (const category of MAINTENANCE_CATEGORIES) {
    const value = maintenance[category.countField];
    if (value !== null && value !== undefined && value !== '') {
      counts[category.countField] = Math.max(0, Number(value) || 0);
    }
  }
  return counts;
}

export default function BulkMaintenanceDevicesScreen() {
  const params = useLocalSearchParams<{
    maintenanceId: string;
    equipmentLocationId?: string;
  }>();
  const maintenanceId = String(params.maintenanceId || '');
  const initialLocationId = String(params.equipmentLocationId || '');
  const router = useRouter();
  const db = useSQLiteContext();
  const { user, loading: authLoading, dataScope, permissions } = useAuth();
  const { refreshStatus } = useSync();

  const [maintenance, setMaintenance] = useState<RecordLike | null>(null);
  const [types, setTypes] = useState<TypeOption[]>([]);
  const [locations, setLocations] = useState<OptionItem[]>([]);
  const [typeValue, setTypeValue] = useState('');
  const [locationValue, setLocationValue] = useState('');
  const [rawNames, setRawNames] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const savingRef = useRef(false);

  const names = useMemo(() => parseBulkMaintenanceDeviceNames(rawNames), [rawNames]);
  const selectedType = types.find((type) => type.value === typeValue);
  const selectedLocation = locations.find((location) => location.value === locationValue);
  const authorized = canEditMaintenance(permissions);
  const readOnly = maintenance ? maintenanceReadOnly(permissions, maintenance.Estado) : true;

  useEffect(() => {
    if (!dataScope || !user || !maintenanceId) return;
    let active = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        // Las lecturas son secuenciales para no reproducir el SQLITE_BUSY del editor.
        const record = await getLocalMaintenance(db, dataScope!, maintenanceId);
        const detail = await readLocalMaintenanceDetail(db, dataScope!, maintenanceId);
        const deviceTypes = await listResourceItems(db, dataScope!, 'deviceType');
        if (!record) throw new Error('El mantenimiento no está disponible en SQLite.');
        if (!detail?.detailComplete) {
          throw new Error('Descargue el detalle completo antes de agregar dispositivos.');
        }

        const selectedCategories = selectedMaintenanceCategories(
          maintenanceCategoryCounts(record),
        );
        const availableTypes: TypeOption[] = selectedCategories.map((category) => {
          const row = deviceTypes.find((item) => (
            canonicalMaintenanceCategoryName(first(item, ['Nombre'])) === category.key
          ));
          const typeId = row ? first(row, ['TipoDispositivoID', 'id']) : '';
          return {
            value: typeId || `legacy:${category.key}`,
            label: category.key,
            category: category.key,
            deviceTypeId: typeId,
          };
        });

        const availableLocations = new Map<string, OptionItem>();
        for (const location of maintenanceEquipmentLocationsFromRecord(record)) {
          availableLocations.set(location.id, {
            value: location.id,
            label: location.name,
          });
        }
        for (const item of detail.dispositivos) {
          const id = first(item, ['UbicacionEquipoID', 'ubicacionEquipoId']);
          const name = first(item, [
            'UbicacionEquipoNombre', 'ubicacionEquipoNombre', 'Zona', 'zona',
          ]);
          if (id && !availableLocations.has(id)) {
            availableLocations.set(id, { value: id, label: name || id });
          }
        }
        if (!active) return;
        setMaintenance(record);
        setTypes(availableTypes);
        const options = [...availableLocations.values()];
        setLocations(options);
        setTypeValue(availableTypes[0]?.value || '');
        setLocationValue(
          options.some((option) => option.value === initialLocationId)
            ? initialLocationId : options[0]?.value || '',
        );
        if (!availableTypes.length) {
          setError('Primero configure cantidades esperadas para los tipos de dispositivo.');
        } else if (!options.length) {
          setError('Agregue una ubicación al mantenimiento antes de registrar la lista.');
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Error al leer SQLite.');
      } finally {
        if (active) setLoading(false);
      }
    }
    load().catch(() => undefined);
    return () => { active = false; };
  }, [db, dataScope, user, maintenanceId, initialLocationId]);

  async function save() {
    if (savingRef.current || !dataScope || !maintenance || !authorized || readOnly) return;
    if (!selectedType || !selectedLocation) {
      setError('Seleccione el tipo de dispositivo y la ubicación.');
      return;
    }
    if (!names.length || names.length > MAX_BULK_MAINTENANCE_DEVICES) {
      setError(`Ingrese entre 1 y ${MAX_BULK_MAINTENANCE_DEVICES} dispositivos por lista.`);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      const patches = buildBulkMaintenanceDevicePayloads({
        names,
        maintenanceId,
        maintenanceType: maintenance.TipoMantenimiento || 'MANTENIMIENTO',
        type: {
          key: selectedType.category,
          typeId: selectedType.deviceTypeId,
        },
        location: {
          id: selectedLocation.value,
          name: selectedLocation.label,
        },
        technicianIds: user?.UsuarioID ? [String(user.UsuarioID)] : [],
        projectChecklist: maintenance.ProyectoChecklistJSON || maintenance.projectChecklist,
      });
      await saveLocalDevicesBulk(db, dataScope, maintenanceId, patches);
      await refreshStatus().catch(() => undefined);
      router.replace({
        pathname: '/maintenance/[maintenanceId]',
        params: { maintenanceId },
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se guardó la lista.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (authLoading) return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
  if (!user) return <Redirect href="/login" />;
  if (user.CambioPasswordObligatorio) return <Redirect href="/change-password" />;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: 'Agregar lista de dispositivos' }} />
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>Agregar dispositivos en masa</Text>
          <Text style={styles.help}>
            Funciona sin Internet. Cada dispositivo se creará en estado pendiente
            para completar después sus datos, preguntas, evidencias y checklist.
          </Text>
          {!authorized || readOnly ? (
            <Text style={styles.error}>No tiene permiso para editar este mantenimiento.</Text>
          ) : null}
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <OptionSheet
            label="Tipo de dispositivo"
            value={typeValue}
            options={types}
            disabled={saving || !authorized || readOnly}
            onChange={(value) => setTypeValue(String(value))}
          />
          <OptionSheet
            label="Ubicación de los equipos"
            value={locationValue}
            options={locations}
            disabled={saving || !authorized || readOnly}
            onChange={(value) => setLocationValue(String(value))}
          />
          <Text style={styles.label}>Nombres de los dispositivos</Text>
          <TextInput
            style={styles.textarea}
            multiline
            value={rawNames}
            onChangeText={setRawNames}
            editable={!saving && authorized && !readOnly}
            placeholder={'Cámara uno\nCámara dos\nCámara tres'}
            placeholderTextColor={colors.muted}
            textAlignVertical="top"
            autoCapitalize="sentences"
            accessibilityLabel="Nombres de dispositivos separados por tabulaciones o saltos de línea"
          />
          <Text style={styles.help}>
            Pegue una columna de Excel, nombres separados por Tab o uno por línea.
            Se conservan las mayúsculas, los espacios internos y los nombres repetidos.
          </Text>
          <Text style={styles.counter}>
            {names.length} de {MAX_BULK_MAINTENANCE_DEVICES} dispositivos
          </Text>
          {names.length > MAX_BULK_MAINTENANCE_DEVICES
            ? <Text style={styles.error}>Divida la lista en grupos de hasta 100.</Text>
            : null}
          {names.length ? (
            <View style={styles.preview}>
              <Text style={styles.previewHeading}>Vista previa</Text>
              {names.slice(0, 8).map((name, index) => (
                <Text key={index} style={styles.previewItem}>• {name}</Text>
              ))}
              {names.length > 8
                ? <Text style={styles.help}>Y {names.length - 8} más…</Text>
                : null}
            </View>
          ) : null}
          <Pressable
            onPress={save}
            accessibilityRole="button"
            disabled={saving || !authorized || readOnly || !names.length
              || names.length > MAX_BULK_MAINTENANCE_DEVICES
              || !selectedType || !selectedLocation}
            style={({ pressed }) => [
              styles.saveButton,
              (saving || !names.length || !authorized || readOnly) && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.saveText}>
              {saving ? 'Guardando en el teléfono…' : `Agregar ${names.length} dispositivos`}
            </Text>
          </Pressable>
          <Text style={styles.help}>
            Guardar no envía los datos a Render. Las altas quedarán en la cola
            local y se sincronizarán en el horario configurado o manualmente.
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.sm },
  title: { color: colors.text, fontSize: 22, fontWeight: '900' },
  help: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  label: { color: colors.text, fontWeight: '800', fontSize: 12, marginTop: spacing.xs },
  textarea: {
    minHeight: 190, borderWidth: 1, borderColor: colors.outlineSoft,
    backgroundColor: colors.surfaceCard, borderRadius: radius.sm,
    padding: spacing.sm, color: colors.text, fontSize: 15,
  },
  counter: { color: colors.text, fontWeight: '800' },
  preview: {
    borderWidth: 1, borderColor: colors.outlineSoft,
    backgroundColor: colors.surfaceCard, borderRadius: radius.md,
    padding: spacing.md, gap: spacing.xs,
  },
  previewHeading: { color: colors.text, fontWeight: '800' },
  previewItem: { color: colors.text, fontSize: 13 },
  error: {
    color: colors.danger, backgroundColor: colors.dangerSoft,
    padding: spacing.sm, borderRadius: radius.sm, fontSize: 13,
  },
  saveButton: {
    backgroundColor: colors.primaryStrong, borderRadius: radius.sm,
    minHeight: 50, alignItems: 'center', justifyContent: 'center',
    marginTop: spacing.xs,
  },
  saveText: { color: '#ffffff', fontSize: 15, fontWeight: '900' },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.45 },
});

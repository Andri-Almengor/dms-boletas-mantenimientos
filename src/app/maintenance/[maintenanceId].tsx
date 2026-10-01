import { useAuth } from '@/auth/AuthProvider';
import { OptionItem } from '@/components/forms/OptionSheet';
import {
  EquipmentLocationCreatorModal,
  EquipmentLocationCreatorValue,
} from '@/components/maintenance/EquipmentLocationCreatorModal';
import { DeviceCard } from '@/components/maintenance/DeviceCard';
import { SyncStatusCard } from '@/components/SyncStatusCard';
import {
  EquipmentLocationDraft,
  saveLocalEquipmentLocation,
} from '@/db/deviceRepository';
import {
  LocalMaintenanceDetail,
  readLocalMaintenanceDetail,
} from '@/db/maintenanceDetailRepository';
import {
  listResourceItems,
  listResourceItemsByParents,
} from '@/db/resourceRepository';
import {
  expectedDeviceTotal,
  formatMaintenanceDate,
  maintenanceClient,
  maintenanceLocation,
  maintenanceResponsible,
  maintenanceTitle,
  normalizeMaintenanceStatus,
} from '@/features/maintenance/maintenanceListDomain';
import {
  canCreateOperationalClientData,
  canEditMaintenance,
  maintenanceReadOnly,
} from '@/features/maintenance/maintenancePermissions';
import { useSync } from '@/sync/SyncProvider';
import { colors, radius, sizing, spacing } from '@/theme/tokens';
import { createLocalId } from '@/utils/localId';
import {
  Redirect,
  Stack,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type RecordLike = Record<string, unknown>;

type DeviceSection = {
  locationId: string;
  title: string;
  subtitle: string;
  data: RecordLike[];
};

function text(value: unknown) {
  return String(value ?? '').trim();
}

function first(
  row: RecordLike | undefined,
  keys: string[],
  fallback = '',
) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && text(value)) {
      return text(value);
    }
  }
  return fallback;
}

function deviceId(item: RecordLike) {
  return first(item, ['EvidenciaMantenimientoID', 'deviceId', 'id']);
}

function equipmentLocationId(item: RecordLike) {
  return first(item, [
    'UbicacionEquipoID',
    'ubicacionEquipoId',
    'equipmentLocationId',
    'id',
  ]);
}

function equipmentLocationName(item: RecordLike) {
  return first(
    item,
    ['Nombre', 'UbicacionEquipo', 'ubicacionEquipoNombre', 'Zona', 'zona'],
    'Ubicación sin nombre',
  );
}

function equipmentParentId(item: RecordLike) {
  return first(item, [
    'UbicacionID',
    'ubicacionId',
    'locationId',
    'ClienteID',
    'clienteId',
  ]);
}

function deviceLocationId(item: RecordLike) {
  return first(item, [
    'UbicacionEquipoID',
    'ubicacionEquipoId',
    'equipmentLocationId',
  ]);
}

function deviceLocationName(item: RecordLike) {
  return first(
    item,
    ['UbicacionEquipoNombre', 'ubicacionEquipoNombre', 'Zona', 'zona'],
    'Sin ubicación',
  );
}

function deviceMatchesSearch(item: RecordLike, query: string) {
  if (!query) return true;
  return [
    'NombreDispositivo',
    'nombre',
    'TipoDispositivo',
    'Categoria',
    'Fabricante',
    'Modelo',
    'Serie',
    'DireccionMAC',
    'Observacion',
  ].some((key) => (
    text(item[key]).toLocaleLowerCase().includes(query)
  ));
}

export default function MaintenanceDetailScreen() {
  const params = useLocalSearchParams<{ maintenanceId: string }>();
  const maintenanceId = String(params.maintenanceId || '');
  const db = useSQLiteContext();
  const router = useRouter();
  const {
    user,
    loading: authLoading,
    dataScope,
    permissions,
  } = useAuth();
  const {
    refreshMaintenanceDetail,
    refreshStatus,
    syncing,
    lastSuccessAt,
    message: syncMessage,
  } = useSync();

  const [detail, setDetail] = useState<LocalMaintenanceDetail | null>(null);
  const [clientLocations, setClientLocations] = useState<RecordLike[]>([]);
  const [equipmentLocations, setEquipmentLocations] = useState<RecordLike[]>([]);
  const [loading, setLoading] = useState(true);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!dataScope || !maintenanceId) return;
    setLoading(true);
    setLocationError('');

    try {
      const localDetail = await readLocalMaintenanceDetail(
        db,
        dataScope,
        maintenanceId,
      );
      setDetail(localDetail);

      if (!localDetail) {
        setClientLocations([]);
        setEquipmentLocations([]);
        return;
      }

      const maintenance = localDetail.mantenimiento;
      const clientId = first(
        maintenance,
        ['ClienteID', 'ClienteRef', 'clienteId'],
      );
      const mainLocationId = first(
        maintenance,
        ['UbicacionID', 'ubicacionId'],
      );

      const localClientLocations = clientId
        ? await listResourceItems(db, dataScope, 'clientLocation', clientId)
        : [];

      const hasMainLocation = localClientLocations.some((row) => (
        first(row, ['UbicacionID', 'ubicacionId', 'id']) === mainLocationId
      ));
      const normalizedClientLocations = (
        mainLocationId && !hasMainLocation
          ? [
              ...localClientLocations,
              {
                UbicacionID: mainLocationId,
                Nombre: maintenanceLocation(maintenance),
              },
            ]
          : localClientLocations
      );

      const localEquipmentLocations = await listResourceItemsByParents(
        db,
        dataScope,
        'equipmentLocation',
        normalizedClientLocations.map((row) => (
          first(row, ['UbicacionID', 'ubicacionId', 'id'])
        )),
      );

      setClientLocations(normalizedClientLocations);
      setEquipmentLocations(localEquipmentLocations);
    } catch (loadError) {
      setLocationError(
        loadError instanceof Error
          ? loadError.message
          : 'No se pudo cargar la información local.',
      );
    } finally {
      setLoading(false);
    }
  }, [db, dataScope, maintenanceId]);

  useEffect(() => {
    setDetail(null);
    setClientLocations([]);
    setEquipmentLocations([]);
  }, [dataScope, maintenanceId]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load, lastSuccessAt]);

  const maintenance = detail?.mantenimiento || {};

  const clientLocationNameById = useMemo(
    () => new Map(
      clientLocations.map((row) => [
        first(row, ['UbicacionID', 'ubicacionId', 'id']),
        first(row, ['Nombre', 'Ubicacion'], 'Ubicación principal'),
      ]),
    ),
    [clientLocations],
  );

  const sections = useMemo<DeviceSection[]>(() => {
    const byId = new Map<string, DeviceSection>();

    for (const location of equipmentLocations) {
      const id = equipmentLocationId(location);
      if (!id) continue;
      const parentId = equipmentParentId(location);
      byId.set(id, {
        locationId: id,
        title: equipmentLocationName(location),
        subtitle: clientLocationNameById.get(parentId) || maintenanceLocation(maintenance),
        data: [],
      });
    }

    for (const item of detail?.dispositivos || []) {
      const id = deviceLocationId(item);
      const name = deviceLocationName(item);
      const key = id || `unassigned:${name}`;
      const current = byId.get(key) || {
        locationId: id,
        title: name,
        subtitle: maintenanceLocation(maintenance),
        data: [],
      };
      current.data.push(item);
      byId.set(key, current);
    }

    return [...byId.values()].sort((a, b) => (
      a.title.localeCompare(b.title, 'es', { sensitivity: 'base' })
    ));
  }, [
    clientLocationNameById,
    detail?.dispositivos,
    equipmentLocations,
    maintenance,
  ]);

  const filteredSections = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return sections;

    return sections
      .map((section) => {
        const locationMatch = (
          section.title.toLocaleLowerCase().includes(query)
          || section.subtitle.toLocaleLowerCase().includes(query)
        );
        return {
          ...section,
          data: locationMatch
            ? section.data
            : section.data.filter((item) => deviceMatchesSearch(item, query)),
        };
      })
      .filter((section) => (
        section.data.length > 0
        || section.title.toLocaleLowerCase().includes(query)
        || section.subtitle.toLocaleLowerCase().includes(query)
      ));
  }, [search, sections]);

  const evidenceCount = useMemo(
    () => (detail?.dispositivos || []).reduce(
      (sum, item) => sum + (
        Array.isArray(item.Imagenes) ? item.Imagenes.length : 0
      ),
      0,
    ),
    [detail],
  );

  async function updateDetail() {
    const refreshed = await refreshMaintenanceDetail(maintenanceId);
    if (refreshed) await load();
  }

  function openDevice(item: RecordLike) {
    const id = deviceId(item);
    if (!id) return;
    router.push({
      pathname: '/maintenance/[maintenanceId]/device/[deviceId]',
      params: { maintenanceId, deviceId: id },
    });
  }

  function openNewDevice(location?: {
    locationId?: string;
    title?: string;
  }) {
    router.push({
      pathname: '/maintenance/[maintenanceId]/device/new',
      params: {
        maintenanceId,
        ...(location?.locationId
          ? {
              equipmentLocationId: location.locationId,
              equipmentLocationName: location.title || '',
            }
          : {}),
      },
    });
  }

  async function createLocation(value: EquipmentLocationCreatorValue) {
    if (!dataScope || savingLocation) return;
    setSavingLocation(true);
    setLocationError('');

    try {
      const draft: EquipmentLocationDraft = {
        localId: createLocalId('ubicacion-equipo'),
        parentLocationId: value.parentLocationId,
        name: value.name,
        description: value.description,
      };
      await saveLocalEquipmentLocation(
        db,
        dataScope,
        maintenanceId,
        draft,
      );
      setLocationModalOpen(false);
      await refreshStatus();
      await load();
    } catch (error) {
      setLocationError(
        error instanceof Error
          ? error.message
          : 'No se pudo guardar la ubicación en este dispositivo.',
      );
    } finally {
      setSavingLocation(false);
    }
  }

  if (authLoading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Mantenimiento' }} />
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (!user) return <Redirect href="/login" />;
  if (user.CambioPasswordObligatorio) {
    return <Redirect href="/change-password" />;
  }

  if (loading && !detail) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Mantenimiento' }} />
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Mantenimiento' }} />
        <Text style={styles.missingTitle}>Mantenimiento no disponible</Text>
        <Text style={styles.missingText}>
          El resumen todavía no está guardado en este dispositivo. Regrese y sincronice la lista.
        </Text>
      </View>
    );
  }

  const status = normalizeMaintenanceStatus(maintenance.Estado);
  const expected = expectedDeviceTotal(maintenance);
  const registered = detail.dispositivos.length;
  const progress = expected > 0
    ? Math.min(100, Math.round((registered / expected) * 100))
    : 0;
  const canEdit = canEditMaintenance(permissions);
  const canCreateLocation = canCreateOperationalClientData(permissions);
  const readOnly = maintenanceReadOnly(permissions, maintenance.Estado);
  const clientLocationOptions: OptionItem[] = clientLocations
    .map((row) => ({
      value: first(row, ['UbicacionID', 'ubicacionId', 'id']),
      label: first(row, ['Nombre', 'Ubicacion'], 'Ubicación principal'),
    }))
    .filter((item) => item.value);
  const mainLocationId = first(
    maintenance,
    ['UbicacionID', 'ubicacionId'],
    clientLocationOptions[0]?.value || '',
  );

  return (
    <>
      <Stack.Screen options={{ title: maintenanceTitle(maintenance) }} />
      <SectionList
        sections={filteredSections}
        keyExtractor={(item, index) => deviceId(item) || `device-${index}`}
        renderItem={({ item }) => (
          <DeviceCard item={item} onPress={() => openDevice(item)} />
        )}
        renderSectionHeader={({ section }) => (
          <View style={styles.locationCard}>
            <View style={styles.locationIcon}>
              <Text style={styles.locationGlyph}>⌖</Text>
            </View>
            <View style={styles.locationCopy}>
              <Text style={styles.locationTitle} numberOfLines={1}>
                {section.title}
              </Text>
              <Text style={styles.locationSubtitle} numberOfLines={1}>
                {section.subtitle} · {section.data.length} dispositivo{section.data.length === 1 ? '' : 's'}
              </Text>
            </View>
            {!readOnly && canEdit && detail.detailComplete && section.locationId ? (
              <Pressable
                onPress={() => openNewDevice(section)}
                accessibilityRole="button"
                accessibilityLabel={`Agregar dispositivo en ${section.title}`}
                style={({ pressed }) => [
                  styles.locationAddButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.locationAddText}>＋</Text>
              </Pressable>
            ) : null}
          </View>
        )}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.content}
        ListHeaderComponent={(
          <View style={styles.header}>
            <View style={styles.hero}>
              <View style={styles.heroTop}>
                <View style={[
                  styles.statusChip,
                  status === 'FINALIZADO' ? styles.done : styles.pending,
                ]}>
                  <Text style={[
                    styles.statusText,
                    status === 'FINALIZADO' ? styles.doneText : styles.pendingText,
                  ]}>
                    {status}
                  </Text>
                </View>
                <Text style={styles.type}>
                  {String(
                    maintenance.TipoMantenimiento || 'MANTENIMIENTO',
                  ).toUpperCase()}
                </Text>
              </View>

              <Text style={styles.client}>{maintenanceClient(maintenance)}</Text>
              <Text style={styles.title}>{maintenanceTitle(maintenance)}</Text>
              <Text style={styles.description}>
                {String(
                  maintenance.DescripcionGeneral || 'Sin descripción general',
                )}
              </Text>

              <View style={styles.heroMeta}>
                <Text style={styles.heroMetaText}>
                  ⌖ {maintenanceLocation(maintenance)}
                </Text>
                <Text style={styles.heroMetaText}>
                  ◷ {formatMaintenanceDate(maintenance.Fecha)}
                </Text>
                <Text style={styles.heroMetaText} numberOfLines={1}>
                  ♟ {maintenanceResponsible(maintenance)}
                </Text>
              </View>
            </View>

            <View style={styles.syncWrap}>
              <SyncStatusCard />
            </View>

            {locationError ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{locationError}</Text>
              </View>
            ) : null}

            {!readOnly && canEdit ? (
              <View style={styles.quickSection}>
                <Text style={styles.sectionEyebrow}>Acciones rápidas</Text>
                <View style={styles.quickActions}>
                  {canCreateLocation && clientLocationOptions.length ? (
                    <Pressable
                      onPress={() => setLocationModalOpen(true)}
                      style={({ pressed }) => [
                        styles.quickButton,
                        styles.quickButtonPrimary,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={styles.quickIconPrimary}>⌖＋</Text>
                      <Text style={styles.quickTextPrimary}>Agregar ubicación</Text>
                    </Pressable>
                  ) : null}

                  {detail.detailComplete ? (
                    <Pressable
                      onPress={() => openNewDevice()}
                      style={({ pressed }) => [
                        styles.quickButton,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={styles.quickIcon}>＋</Text>
                      <Text style={styles.quickText}>
                        Agregar dispositivo
                      </Text>
                    </Pressable>
                  ) : null}
                </View>

                <Pressable
                  onPress={() => router.push({
                    pathname: '/maintenance/[maintenanceId]/edit',
                    params: { maintenanceId },
                  })}
                  style={styles.editLink}
                >
                  <Text style={styles.editLinkText}>Editar datos del mantenimiento</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.progressCard}>
              <View style={styles.progressHeader}>
                <View>
                  <Text style={styles.sectionEyebrow}>Avance del inventario</Text>
                  <Text style={styles.progressTitle}>Dispositivos registrados</Text>
                </View>
                <Text style={styles.progressPercent}>{progress}%</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[
                  styles.progressFill,
                  { width: `${progress}%` as `${number}%` },
                ]} />
              </View>
              <Text style={styles.progressCaption}>
                {expected > 0
                  ? `${registered} de ${expected} dispositivos registrados`
                  : `${registered} dispositivo${registered === 1 ? '' : 's'} registrado${registered === 1 ? '' : 's'}`}
              </Text>
            </View>

            <View style={styles.downloadCard}>
              <View style={styles.downloadIcon}>
                <Text style={styles.downloadGlyph}>
                  {detail.detailComplete ? '✓' : '↓'}
                </Text>
              </View>
              <View style={styles.downloadText}>
                <Text style={styles.downloadTitle}>
                  {detail.detailComplete
                    ? 'Disponible sin conexión'
                    : 'Detalle pendiente de descarga'}
                </Text>
                <Text style={styles.downloadDescription}>
                  {detail.detailComplete
                    ? `${registered} dispositivos · ${evidenceCount} evidencias guardadas`
                    : 'Descargue una vez el detalle para trabajar con dispositivos y evidencias sin conexión.'}
                </Text>
              </View>
              <Pressable
                onPress={updateDetail}
                disabled={syncing}
                style={({ pressed }) => [
                  styles.updateButton,
                  pressed && !syncing && styles.pressed,
                  syncing && styles.disabled,
                ]}
              >
                {syncing ? (
                  <ActivityIndicator color={colors.primary} size="small" />
                ) : (
                  <Text style={styles.updateButtonText}>
                    {detail.detailComplete ? 'Actualizar' : 'Descargar'}
                  </Text>
                )}
              </Pressable>
            </View>

            <View style={styles.inventoryHeading}>
              <View>
                <Text style={styles.sectionEyebrow}>Inventario</Text>
                <Text style={styles.inventoryTitle}>
                  Ubicaciones y dispositivos
                </Text>
              </View>
              <Text style={styles.inventoryCount}>
                {registered}
              </Text>
            </View>

            <View style={styles.searchBox}>
              <Text style={styles.searchIcon}>⌕</Text>
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Buscar dispositivo, modelo, serie o ubicación"
                placeholderTextColor={colors.muted}
                autoCorrect={false}
                returnKeyType="search"
                style={styles.searchInput}
              />
              {search ? (
                <Pressable
                  onPress={() => setSearch('')}
                  hitSlop={10}
                  style={styles.clearButton}
                >
                  <Text style={styles.clearText}>×</Text>
                </Pressable>
              ) : null}
            </View>

            {!detail.detailComplete ? (
              <View style={styles.emptyDevices}>
                <Text style={styles.emptyDevicesTitle}>
                  Descargue el detalle para continuar
                </Text>
                <Text style={styles.emptyDevicesText}>
                  La lista puede seguir mostrándose con el resumen, pero los dispositivos necesitan el detalle local completo.
                </Text>
              </View>
            ) : null}

            {detail.detailComplete && !sections.length ? (
              <View style={styles.emptyDevices}>
                <Text style={styles.emptyDevicesTitle}>
                  Sin ubicaciones ni dispositivos
                </Text>
                <Text style={styles.emptyDevicesText}>
                  Agregue una ubicación para organizar el trabajo o registre directamente el primer dispositivo.
                </Text>
              </View>
            ) : null}

            {detail.detailComplete && sections.length > 0 && !filteredSections.length ? (
              <View style={styles.emptyDevices}>
                <Text style={styles.emptyDevicesTitle}>Sin coincidencias</Text>
                <Text style={styles.emptyDevicesText}>
                  No hay dispositivos o ubicaciones que coincidan con la búsqueda.
                </Text>
              </View>
            ) : null}

            {syncing && syncMessage ? (
              <Text style={styles.syncProgressText} numberOfLines={1}>
                {syncMessage}
              </Text>
            ) : null}
          </View>
        )}
      />

      <EquipmentLocationCreatorModal
        visible={locationModalOpen}
        parentOptions={clientLocationOptions}
        initialParentId={mainLocationId}
        saving={savingLocation}
        onClose={() => setLocationModalOpen(false)}
        onSubmit={createLocation}
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  missingTitle: {
    color: colors.text,
    fontWeight: '900',
    fontSize: 19,
  },
  missingText: {
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
  content: {
    backgroundColor: colors.surface,
    paddingBottom: spacing.xl,
  },
  header: {
    gap: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  hero: {
    marginHorizontal: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    gap: spacing.xs,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  pending: { backgroundColor: colors.warningSoft },
  done: { backgroundColor: colors.successSoft },
  statusText: {
    fontSize: 10,
    fontWeight: '900',
  },
  pendingText: { color: colors.warning },
  doneText: { color: colors.success },
  type: {
    color: colors.muted,
    fontWeight: '900',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  client: {
    color: colors.primary,
    fontWeight: '900',
    textTransform: 'uppercase',
    fontSize: 11,
    marginTop: spacing.xs,
  },
  title: {
    color: colors.text,
    fontWeight: '900',
    fontSize: 23,
    lineHeight: 28,
  },
  description: {
    color: colors.muted,
    lineHeight: 19,
    fontSize: 12,
  },
  heroMeta: {
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.outlineSoft,
    gap: 5,
  },
  heroMetaText: {
    color: colors.muted,
    fontSize: 11,
  },
  syncWrap: {
    marginHorizontal: spacing.md,
  },
  errorBox: {
    marginHorizontal: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.dangerSoft,
  },
  errorText: {
    color: colors.danger,
    fontWeight: '800',
    fontSize: 12,
  },
  quickSection: {
    marginHorizontal: spacing.md,
    gap: spacing.xs,
  },
  sectionEyebrow: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  quickActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  quickButton: {
    flex: 1,
    minHeight: sizing.buttonHeight,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    backgroundColor: colors.surfaceCard,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  quickButtonPrimary: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  quickIcon: {
    color: colors.primary,
    fontWeight: '900',
    fontSize: 16,
  },
  quickIconPrimary: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 18,
  },
  quickText: {
    color: colors.text,
    fontWeight: '900',
    fontSize: 11,
  },
  quickTextPrimary: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 11,
  },
  editLink: {
    minHeight: sizing.touchTargetMin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editLinkText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '800',
  },
  progressCard: {
    marginHorizontal: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    gap: spacing.sm,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  progressTitle: {
    color: colors.text,
    fontWeight: '900',
    fontSize: 16,
    marginTop: 3,
  },
  progressPercent: {
    color: colors.primary,
    fontWeight: '900',
    fontSize: 24,
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: colors.surfaceHigh,
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  progressCaption: {
    color: colors.muted,
    fontSize: 11,
  },
  downloadCard: {
    marginHorizontal: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  downloadIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadGlyph: {
    color: colors.primary,
    fontWeight: '900',
    fontSize: 17,
  },
  downloadText: {
    flex: 1,
    minWidth: 0,
  },
  downloadTitle: {
    color: colors.text,
    fontWeight: '900',
    fontSize: 12,
  },
  downloadDescription: {
    color: colors.muted,
    lineHeight: 16,
    fontSize: 10,
    marginTop: 2,
  },
  updateButton: {
    minHeight: sizing.touchTargetMin,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateButtonText: {
    color: colors.primary,
    fontWeight: '900',
    fontSize: 10,
  },
  inventoryHeading: {
    marginHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  inventoryTitle: {
    color: colors.text,
    fontWeight: '900',
    fontSize: 20,
    marginTop: 3,
  },
  inventoryCount: {
    minWidth: 32,
    height: 32,
    paddingHorizontal: 9,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    color: colors.primary,
    textAlign: 'center',
    textAlignVertical: 'center',
    fontWeight: '900',
    fontSize: 12,
  },
  searchBox: {
    marginHorizontal: spacing.md,
    minHeight: sizing.controlHeight,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  searchIcon: {
    color: colors.primary,
    fontSize: 22,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    fontSize: 12,
  },
  clearButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearText: {
    color: colors.muted,
    fontSize: 23,
  },
  locationCard: {
    minHeight: 68,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  locationIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationGlyph: {
    color: colors.primary,
    fontSize: 20,
    fontWeight: '900',
  },
  locationCopy: {
    flex: 1,
    minWidth: 0,
  },
  locationTitle: {
    color: colors.text,
    fontWeight: '900',
    fontSize: 15,
  },
  locationSubtitle: {
    color: colors.muted,
    fontSize: 10,
    marginTop: 3,
  },
  locationAddButton: {
    width: sizing.touchTargetMin,
    height: sizing.touchTargetMin,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationAddText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 23,
    lineHeight: 25,
  },
  emptyDevices: {
    marginHorizontal: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    alignItems: 'center',
    gap: spacing.xs,
  },
  emptyDevicesTitle: {
    color: colors.text,
    fontWeight: '900',
  },
  emptyDevicesText: {
    color: colors.muted,
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 17,
  },
  syncProgressText: {
    marginHorizontal: spacing.md,
    color: colors.muted,
    fontSize: 10,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.76,
  },
  disabled: {
    opacity: 0.5,
  },
});

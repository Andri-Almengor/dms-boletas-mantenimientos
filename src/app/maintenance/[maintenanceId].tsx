import { DeviceCard } from '@/components/maintenance/DeviceCard';
import {
  LocalMaintenanceDetail,
  readLocalMaintenanceDetail,
} from '@/db/maintenanceDetailRepository';
import {
  expectedDeviceTotal,
  formatMaintenanceDate,
  maintenanceClient,
  maintenanceLocation,
  maintenanceResponsible,
  maintenanceTitle,
  normalizeMaintenanceStatus,
} from '@/features/maintenance/maintenanceListDomain';
import { useAuth } from '@/auth/AuthProvider';
import { useSync } from '@/sync/SyncProvider';
import { colors, radius, sizing, spacing } from '@/theme/tokens';
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
  View,
} from 'react-native';

type DeviceSection = {
  title: string;
  data: Record<string, unknown>[];
};

function deviceId(item: Record<string, unknown>) {
  return String(item.EvidenciaMantenimientoID || item.deviceId || item.id || '');
}

function deviceCategory(item: Record<string, unknown>) {
  return String(item.Categoria || item.TipoDispositivo || 'Otros');
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
  } = useAuth();
  const {
    refreshMaintenanceDetail,
    syncing,
    lastSuccessAt,
    message: syncMessage,
  } = useSync();
  const [detail, setDetail] = useState<LocalMaintenanceDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!dataScope || !maintenanceId) return;
    setLoading(true);
    try {
      setDetail(await readLocalMaintenanceDetail(db, dataScope, maintenanceId));
    } finally {
      setLoading(false);
    }
  }, [db, dataScope, maintenanceId]);

  useEffect(() => {
    setDetail(null);
  }, [dataScope, maintenanceId]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load, lastSuccessAt]);

  const sections = useMemo<DeviceSection[]>(() => {
    const grouped = new Map<string, Record<string, unknown>[]>();
    for (const item of detail?.dispositivos || []) {
      const key = deviceCategory(item);
      const list = grouped.get(key) || [];
      list.push(item);
      grouped.set(key, list);
    }
    return [...grouped.entries()].map(([title, data]) => ({ title, data }));
  }, [detail]);

  const maintenance = detail?.mantenimiento || {};
  const evidenceCount = useMemo(
    () => (detail?.dispositivos || []).reduce(
      (sum, item) => sum + (Array.isArray(item.Imagenes) ? item.Imagenes.length : 0),
      0,
    ),
    [detail],
  );

  async function updateDetail() {
    const refreshed = await refreshMaintenanceDetail(maintenanceId);
    if (refreshed) await load();
  }

  function openDevice(item: Record<string, unknown>) {
    const id = deviceId(item);
    if (!id) return;
    router.push({
      pathname: '/maintenance/[maintenanceId]/device/[deviceId]',
      params: { maintenanceId, deviceId: id },
    });
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
  if (user.CambioPasswordObligatorio) return <Redirect href="/change-password" />;

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
          El resumen no está guardado en este dispositivo. Regrese y sincronice la lista.
        </Text>
      </View>
    );
  }

  const status = normalizeMaintenanceStatus(maintenance.Estado);
  const expected = expectedDeviceTotal(maintenance);

  return (
    <>
      <Stack.Screen options={{ title: maintenanceTitle(maintenance) }} />
      <SectionList
        sections={sections}
        keyExtractor={(item, index) => deviceId(item) || `device-${index}`}
        renderItem={({ item }) => (
          <DeviceCard item={item} onPress={() => openDevice(item)} />
        )}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionCount}>{section.data.length}</Text>
          </View>
        )}
        stickySectionHeadersEnabled
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
                  {String(maintenance.TipoMantenimiento || 'MANTENIMIENTO').toUpperCase()}
                </Text>
              </View>
              <Text style={styles.client}>{maintenanceClient(maintenance)}</Text>
              <Text style={styles.title}>{maintenanceTitle(maintenance)}</Text>
              <Text style={styles.description}>
                {String(maintenance.DescripcionGeneral || 'Sin descripción general')}
              </Text>
            </View>

            <View style={styles.summaryGrid}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Fecha</Text>
                <Text style={styles.summaryValue}>{formatMaintenanceDate(maintenance.Fecha)}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Ubicación</Text>
                <Text style={styles.summaryValue}>{maintenanceLocation(maintenance)}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Responsables</Text>
                <Text style={styles.summaryValue}>{maintenanceResponsible(maintenance)}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Dispositivos</Text>
                <Text style={styles.summaryValue}>
                  {detail.dispositivos.length} / {expected || detail.dispositivos.length}
                </Text>
              </View>
            </View>

            <View style={styles.downloadCard}>
              <View style={styles.downloadText}>
                <Text style={styles.downloadTitle}>
                  {detail.detailComplete
                    ? 'Detalle disponible sin conexión'
                    : 'Detalle todavía no descargado'}
                </Text>
                <Text style={styles.downloadDescription}>
                  {detail.detailComplete
                    ? `${detail.dispositivos.length} dispositivos · ${evidenceCount} evidencias en SQLite`
                    : 'El resumen está guardado, pero dispositivos y evidencias requieren una actualización manual con conexión.'}
                </Text>
                {detail.downloadedAt ? (
                  <Text style={styles.downloadTime}>
                    Última descarga: {formatMaintenanceDate(detail.downloadedAt)}
                  </Text>
                ) : null}
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
                {syncing ? <ActivityIndicator color="#fff" /> : null}
                <Text style={styles.updateButtonText}>
                  {syncing ? syncMessage : detail.detailComplete ? 'Actualizar detalle' : 'Descargar detalle'}
                </Text>
              </Pressable>
            </View>

            {detail.detailComplete && !sections.length ? (
              <View style={styles.emptyDevices}>
                <Text style={styles.emptyDevicesTitle}>Sin dispositivos registrados</Text>
                <Text style={styles.emptyDevicesText}>
                  Este mantenimiento no contiene dispositivos en el snapshot local.
                </Text>
              </View>
            ) : null}
          </View>
        )}
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
  missingTitle: { color: colors.text, fontWeight: '900', fontSize: 19 },
  missingText: { color: colors.muted, textAlign: 'center', lineHeight: 20 },
  content: { backgroundColor: colors.surface, paddingBottom: spacing.xl },
  header: { gap: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm },
  hero: {
    marginHorizontal: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineSoft,
    gap: spacing.xs,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusChip: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
  pending: { backgroundColor: colors.warningSoft },
  done: { backgroundColor: colors.successSoft },
  statusText: { fontSize: 10, fontWeight: '900' },
  pendingText: { color: colors.warning },
  doneText: { color: colors.success },
  type: { color: colors.muted, fontWeight: '800', fontSize: 10 },
  client: {
    color: colors.primary,
    fontWeight: '900',
    textTransform: 'uppercase',
    fontSize: 11,
    marginTop: spacing.xs,
  },
  title: { color: colors.text, fontWeight: '900', fontSize: 23, lineHeight: 28 },
  description: { color: colors.muted, lineHeight: 20 },
  summaryGrid: {
    marginHorizontal: spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  summaryCard: {
    minWidth: '47%',
    flexGrow: 1,
    flexBasis: '47%',
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceLow,
    gap: 3,
  },
  summaryLabel: { color: colors.muted, fontSize: 10, fontWeight: '700' },
  summaryValue: { color: colors.text, fontWeight: '800', fontSize: 12 },
  downloadCard: {
    marginHorizontal: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
    gap: spacing.sm,
  },
  downloadText: { gap: 3 },
  downloadTitle: { color: colors.text, fontWeight: '900', fontSize: 15 },
  downloadDescription: { color: colors.variant, lineHeight: 18, fontSize: 12 },
  downloadTime: { color: colors.muted, fontSize: 10, marginTop: 2 },
  updateButton: {
    minHeight: sizing.buttonHeight,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  updateButtonText: { color: '#fff', fontWeight: '900', textAlign: 'center' },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.6 },
  sectionHeader: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: { color: colors.text, fontWeight: '900', fontSize: 15 },
  sectionCount: {
    color: colors.primary,
    fontWeight: '900',
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    fontSize: 11,
  },
  emptyDevices: {
    marginHorizontal: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceCard,
    alignItems: 'center',
    gap: spacing.xs,
  },
  emptyDevicesTitle: { color: colors.text, fontWeight: '900' },
  emptyDevicesText: { color: colors.muted, textAlign: 'center' },
});

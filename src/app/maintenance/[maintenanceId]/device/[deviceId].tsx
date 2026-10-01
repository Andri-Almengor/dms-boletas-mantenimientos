import {
  LocalDeviceDetail,
  readLocalDeviceDetail,
} from '@/db/maintenanceDetailRepository';
import { MaintenanceEvidenceManager } from '@/components/maintenance/MaintenanceEvidenceManager';
import { useAuth } from '@/auth/AuthProvider';
import { getLocalMaintenance } from '@/db/maintenanceRepository';
import {
  canEditMaintenance,
  maintenanceReadOnly,
} from '@/features/maintenance/maintenancePermissions';
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
  useState,
} from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

function value(record: Record<string, unknown>, keys: string[], fallback = 'Sin dato') {
  for (const key of keys) {
    const current = record[key];
    if (current !== undefined && current !== null && String(current).trim()) {
      return String(current);
    }
  }
  return fallback;
}

function evidenceId(record: Record<string, unknown>) {
  return String(record.FotoDispositivoID || record.imageId || record.id || '');
}

export default function DeviceDetailScreen() {
  const params = useLocalSearchParams<{
    maintenanceId: string;
    deviceId: string;
  }>();
  const maintenanceId = String(params.maintenanceId || '');
  const deviceId = String(params.deviceId || '');
  const db = useSQLiteContext();
  const router = useRouter();
  const {
    user,
    loading: authLoading,
    dataScope,
    permissions,
  } = useAuth();
  const [detail, setDetail] = useState<LocalDeviceDetail | null>(null);
  const [maintenance, setMaintenance] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    if (!dataScope || !maintenanceId || !deviceId) return;
    const [deviceDetail, maintenanceRow] = await Promise.all([
      readLocalDeviceDetail(
        db,
        dataScope,
        maintenanceId,
        deviceId,
      ),
      getLocalMaintenance(db, dataScope, maintenanceId),
    ]);
    setDetail(deviceDetail);
    setMaintenance(maintenanceRow);
  }, [db, dataScope, maintenanceId, deviceId]);

  useEffect(() => {
    setDetail(null);
    setMaintenance(null);
  }, [dataScope, maintenanceId, deviceId]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  if (authLoading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Dispositivo' }} />
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (!user) return <Redirect href="/login" />;
  if (user.CambioPasswordObligatorio) return <Redirect href="/change-password" />;

  if (!detail) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Dispositivo' }} />
        <Text style={styles.missingTitle}>Dispositivo no disponible</Text>
        <Text style={styles.missingText}>
          Este dispositivo no está guardado en el detalle local.
        </Text>
      </View>
    );
  }

  const device = detail.device;
  const title = value(device, ['NombreDispositivo', 'nombre'], 'Dispositivo');
  const canEdit = canEditMaintenance(permissions);
  const readOnly = maintenanceReadOnly(permissions, maintenance?.Estado);

  function navigate(targetId: string) {
    if (!targetId) return;
    router.replace({
      pathname: '/maintenance/[maintenanceId]/device/[deviceId]',
      params: { maintenanceId, deviceId: targetId },
    });
  }

  return (
    <>
      <Stack.Screen options={{ title }} />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
      >
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <Text style={styles.category}>
              {value(device, ['Categoria', 'TipoDispositivo'], 'Dispositivo')}
            </Text>
            <Text style={styles.position}>
              {detail.position} de {detail.total}
            </Text>
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.zone}>
            {value(device, ['UbicacionEquipoNombre', 'Zona', 'zona'], 'Sin ubicación')}
          </Text>
        </View>

        {canEdit && maintenance ? (
          <Pressable
            disabled={readOnly}
            onPress={() => router.push({
              pathname: '/maintenance/[maintenanceId]/device/[deviceId]/edit',
              params: { maintenanceId, deviceId },
            })}
            style={[
              styles.editButton,
              readOnly && styles.navDisabled,
            ]}
          >
            <Text style={styles.editButtonText}>
              {readOnly ? 'Finalizado · solo lectura' : 'Editar dispositivo'}
            </Text>
          </Pressable>
        ) : null}

        <View style={styles.grid}>
          {[
            ['Fabricante', value(device, ['Fabricante', 'fabricante'])],
            ['Modelo', value(device, ['Modelo', 'modelo'])],
            ['Serie', value(device, ['Serie', 'serie'])],
            ['Estado', value(device, ['Estado', 'estado'])],
            ['Funcionamiento', value(device, ['Funcionamiento', 'funcionamiento'])],
            ['En uso', value(device, ['EnUso', 'enUso'])],
          ].map(([label, text]) => (
            <View key={label} style={styles.infoCard}>
              <Text style={styles.infoLabel}>{label}</Text>
              <Text style={styles.infoValue}>{text}</Text>
            </View>
          ))}
        </View>

        {String(device.Observacion || device.observacion || '').trim() ? (
          <View style={styles.observation}>
            <Text style={styles.observationLabel}>Observación</Text>
            <Text style={styles.observationText}>
              {String(device.Observacion || device.observacion)}
            </Text>
          </View>
        ) : null}

        <MaintenanceEvidenceManager
          maintenanceId={maintenanceId}
          deviceId={deviceId}
          device={device}
          maintenanceType={
            maintenance?.TipoMantenimiento
              || device.TipoMantenimiento
              || 'MANTENIMIENTO'
          }
          readOnly={!canEdit || readOnly}
        />

        <View style={styles.navigation}>
          <Pressable
            style={[
              styles.navButton,
              !detail.previousDeviceId && styles.navDisabled,
            ]}
            disabled={!detail.previousDeviceId}
            onPress={() => navigate(detail.previousDeviceId)}
          >
            <Text style={styles.navLabel}>‹ Anterior</Text>
          </Pressable>
          <Pressable
            style={[
              styles.navButton,
              styles.navPrimary,
              !detail.nextDeviceId && styles.navDisabled,
            ]}
            disabled={!detail.nextDeviceId}
            onPress={() => navigate(detail.nextDeviceId)}
          >
            <Text style={[styles.navLabel, styles.navPrimaryLabel]}>
              Siguiente ›
            </Text>
          </Pressable>
        </View>
      </ScrollView>

    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  center: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  missingTitle: { color: colors.text, fontWeight: '900', fontSize: 19 },
  missingText: { color: colors.muted, textAlign: 'center' },
  hero: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineSoft,
    gap: spacing.xs,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  category: {
    color: colors.primary,
    fontWeight: '900',
    textTransform: 'uppercase',
    fontSize: 11,
  },
  position: { color: colors.muted, fontWeight: '800', fontSize: 11 },
  title: { color: colors.text, fontWeight: '900', fontSize: 24 },
  zone: { color: colors.muted, lineHeight: 19 },
  editButton: {
    minHeight: sizing.buttonHeight,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButtonText: { color: '#fff', fontWeight: '900' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  infoCard: {
    minWidth: '47%',
    flexGrow: 1,
    flexBasis: '47%',
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceLow,
    gap: 3,
  },
  infoLabel: { color: colors.muted, fontSize: 10, fontWeight: '700' },
  infoValue: { color: colors.text, fontWeight: '800', fontSize: 12 },
  observation: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    gap: spacing.xs,
  },
  observationLabel: { color: colors.primary, fontWeight: '900', fontSize: 11 },
  observationText: { color: colors.text, lineHeight: 20 },
  navPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  navDisabled: { opacity: 0.35 },
  navLabel: { color: colors.text, fontWeight: '900' },
  navPrimaryLabel: { color: '#fff' },
});

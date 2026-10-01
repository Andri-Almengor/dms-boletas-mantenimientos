import {
  readLocalDeviceDetail,
} from '@/db/maintenanceDetailRepository';
import { useAuth } from '@/auth/AuthProvider';
import { colors, radius, sizing, spacing } from '@/theme/tokens';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React, {
  useCallback,
  useEffect,
  useState,
} from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type DeviceDetail = NonNullable<Awaited<ReturnType<typeof readLocalDeviceDetail>>>;

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
  const { dataScope } = useAuth();
  const [detail, setDetail] = useState<DeviceDetail | null>(null);
  const [previewUri, setPreviewUri] = useState('');

  const load = useCallback(async () => {
    if (!dataScope || !maintenanceId || !deviceId) return;
    setDetail(await readLocalDeviceDetail(
      db,
      dataScope,
      maintenanceId,
      deviceId,
    ));
  }, [db, dataScope, maintenanceId, deviceId]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

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

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Evidencias</Text>
          <Text style={styles.sectionCount}>{detail.evidence.length}</Text>
        </View>

        {detail.evidence.length ? (
          <View style={styles.gallery}>
            {detail.evidence.map((item) => {
              const meta = item.__local && typeof item.__local === 'object'
                ? item.__local as { localUri?: string }
                : {};
              const uri = String(meta.localUri || '');
              return (
                <Pressable
                  key={evidenceId(item)}
                  style={styles.evidenceCard}
                  disabled={!uri}
                  onPress={() => uri && setPreviewUri(uri)}
                >
                  {uri ? (
                    <Image source={{ uri }} style={styles.image} resizeMode="cover" />
                  ) : (
                    <View style={styles.imagePlaceholder}>
                      <Text style={styles.placeholderIcon}>▧</Text>
                      <Text style={styles.placeholderText}>Imagen en servidor</Text>
                    </View>
                  )}
                  <View style={styles.evidenceBody}>
                    <Text style={styles.evidenceType}>
                      {value(item, ['Tipo', 'tipo'], 'Evidencia')}
                    </Text>
                    <Text style={styles.evidenceNote} numberOfLines={2}>
                      {value(item, ['Nota', 'nota'], 'Sin nota')}
                    </Text>
                    {!uri ? (
                      <Text style={styles.remoteHint}>
                        La descarga segura de medios se completa en la etapa de evidencias.
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={styles.noEvidence}>
            <Text style={styles.noEvidenceTitle}>Sin evidencias</Text>
            <Text style={styles.noEvidenceText}>
              No hay imágenes guardadas para este dispositivo.
            </Text>
          </View>
        )}

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

      <Modal
        visible={Boolean(previewUri)}
        animationType="fade"
        transparent
        onRequestClose={() => setPreviewUri('')}
      >
        <Pressable
          style={styles.lightbox}
          onPress={() => setPreviewUri('')}
        >
          {previewUri ? (
            <Image
              source={{ uri: previewUri }}
              style={styles.lightboxImage}
              resizeMode="contain"
            />
          ) : null}
          <Text style={styles.closeHint}>Toque para cerrar</Text>
        </Pressable>
      </Modal>
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
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: { color: colors.text, fontWeight: '900', fontSize: 18 },
  sectionCount: {
    color: colors.primary,
    fontWeight: '900',
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  gallery: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  evidenceCard: {
    flexBasis: '47%',
    flexGrow: 1,
    minWidth: 140,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineSoft,
  },
  image: { width: '100%', aspectRatio: 4 / 3, backgroundColor: colors.surfaceLow },
  imagePlaceholder: {
    width: '100%',
    aspectRatio: 4 / 3,
    backgroundColor: colors.surfaceLow,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
  },
  placeholderIcon: { color: colors.primary, fontSize: 26 },
  placeholderText: { color: colors.muted, fontWeight: '700', fontSize: 11 },
  evidenceBody: { padding: spacing.sm, gap: 3 },
  evidenceType: { color: colors.primary, fontWeight: '900', fontSize: 10 },
  evidenceNote: { color: colors.text, fontWeight: '700', fontSize: 12 },
  remoteHint: { color: colors.muted, fontSize: 9, lineHeight: 12, marginTop: 2 },
  noEvidence: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceCard,
    alignItems: 'center',
    gap: spacing.xs,
  },
  noEvidenceTitle: { color: colors.text, fontWeight: '900' },
  noEvidenceText: { color: colors.muted, textAlign: 'center' },
  navigation: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  navButton: {
    flex: 1,
    minHeight: sizing.buttonHeight,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    backgroundColor: colors.surfaceCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  navDisabled: { opacity: 0.35 },
  navLabel: { color: colors.text, fontWeight: '900' },
  navPrimaryLabel: { color: '#fff' },
  lightbox: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
  lightboxImage: { width: '100%', height: '80%' },
  closeHint: { color: '#fff', marginTop: spacing.sm, fontWeight: '700' },
});

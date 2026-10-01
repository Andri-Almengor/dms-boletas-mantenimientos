import {
  expectedDeviceTotal,
  formatMaintenanceDate,
  maintenanceClient,
  maintenanceLocation,
  maintenanceRecordId,
  maintenanceResponsible,
  maintenanceTitle,
  normalizeMaintenanceStatus,
} from '@/features/maintenance/maintenanceListDomain';
import { colors, radius, spacing } from '@/theme/tokens';
import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type Props = {
  item: Record<string, unknown>;
  onPress: (maintenanceId: string) => void;
};

function localMeta(item: Record<string, unknown>) {
  const value = item.__local;
  return value && typeof value === 'object'
    ? value as { syncStatus?: string; detailComplete?: boolean }
    : {};
}

export function MaintenanceCard({ item, onPress }: Props) {
  const id = maintenanceRecordId(item);
  const status = normalizeMaintenanceStatus(item.Estado);
  const completed = Number(item.DispositivosRegistrados || item.CantidadDispositivos || 0);
  const expected = expectedDeviceTotal(item);
  const meta = localMeta(item);
  const pending = meta.syncStatus && meta.syncStatus !== 'SYNCED';

  return (
    <Pressable
      onPress={() => id && onPress(id)}
      style={({ pressed }) => [
        styles.card,
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Abrir ${maintenanceTitle(item)}`}
    >
      <View style={styles.topRow}>
        <View style={styles.typeBadge}>
          <Text style={styles.typeBadgeText}>
            {String(item.TipoMantenimiento || 'MANTENIMIENTO').toUpperCase()}
          </Text>
        </View>
        <View style={[
          styles.statusChip,
          status === 'FINALIZADO' ? styles.statusDone : styles.statusPending,
        ]}>
          <Text style={[
            styles.statusText,
            status === 'FINALIZADO' ? styles.statusDoneText : styles.statusPendingText,
          ]}>
            {status}
          </Text>
        </View>
      </View>

      <Text style={styles.client}>{maintenanceClient(item)}</Text>
      <Text style={styles.title} numberOfLines={2}>{maintenanceTitle(item)}</Text>
      <Text style={styles.description} numberOfLines={2}>
        {String(item.DescripcionGeneral || 'Sin descripción general')}
      </Text>

      <View style={styles.metaList}>
        <Text style={styles.meta}>▣ {formatMaintenanceDate(item.Fecha)}</Text>
        <Text style={styles.meta} numberOfLines={1}>⌖ {maintenanceLocation(item)}</Text>
        <Text style={styles.meta} numberOfLines={1}>♟ {maintenanceResponsible(item)}</Text>
      </View>

      <View style={styles.progressRow}>
        <View style={styles.progressCell}>
          <Text style={styles.progressValue}>{completed}</Text>
          <Text style={styles.progressLabel}>registrados</Text>
        </View>
        <View style={styles.progressCell}>
          <Text style={styles.progressValue}>{expected}</Text>
          <Text style={styles.progressLabel}>esperados</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.offlineState}>
          {meta.detailComplete ? 'Disponible sin conexión' : 'Resumen descargado'}
        </Text>
        {pending ? <Text style={styles.pendingLocal}>● Cambio local</Text> : null}
        <Text style={styles.chevron}>›</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineSoft,
    gap: spacing.xs,
  },
  pressed: { opacity: 0.82, transform: [{ scale: 0.995 }] },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  typeBadge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.primarySoft,
  },
  typeBadgeText: {
    color: colors.primary,
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 0.4,
  },
  statusChip: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statusPending: { backgroundColor: colors.warningSoft },
  statusDone: { backgroundColor: colors.successSoft },
  statusText: { fontWeight: '800', fontSize: 10 },
  statusPendingText: { color: colors.warning },
  statusDoneText: { color: colors.success },
  client: {
    color: colors.primary,
    fontWeight: '800',
    fontSize: 11,
    textTransform: 'uppercase',
    marginTop: spacing.xs,
  },
  title: { color: colors.text, fontWeight: '800', fontSize: 18, lineHeight: 23 },
  description: { color: colors.muted, lineHeight: 19, fontSize: 13 },
  metaList: { gap: 5, marginTop: spacing.xs },
  meta: { color: colors.muted, fontSize: 12 },
  progressRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  progressCell: {
    flex: 1,
    backgroundColor: colors.surfaceLow,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
    alignItems: 'center',
  },
  progressValue: { color: colors.text, fontWeight: '900', fontSize: 18 },
  progressLabel: { color: colors.muted, fontSize: 10 },
  footer: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  offlineState: { color: colors.muted, fontSize: 11, flex: 1 },
  pendingLocal: { color: colors.warning, fontWeight: '700', fontSize: 10 },
  chevron: { color: colors.primary, fontSize: 28, lineHeight: 28 },
});

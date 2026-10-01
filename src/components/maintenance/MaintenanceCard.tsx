import {
  expectedDeviceTotal,
  formatMaintenanceDate,
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
  const completed = Number(
    item.DispositivosRegistrados || item.CantidadDispositivos || 0,
  );
  const expected = expectedDeviceTotal(item);
  const progress = expected > 0
    ? Math.min(100, Math.round((completed / expected) * 100))
    : 0;
  const meta = localMeta(item);
  const pending = Boolean(
    meta.syncStatus && meta.syncStatus !== 'SYNCED',
  );
  const type = String(
    item.TipoMantenimiento || 'MANTENIMIENTO',
  ).toUpperCase();

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
      <View style={[
        styles.accent,
        status === 'FINALIZADO' ? styles.accentDone : styles.accentPending,
      ]} />

      <View style={styles.body}>
        <View style={styles.topRow}>
          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText}>{type}</Text>
          </View>
          <View style={[
            styles.statusChip,
            status === 'FINALIZADO'
              ? styles.statusDone
              : styles.statusPending,
          ]}>
            <Text style={[
              styles.statusText,
              status === 'FINALIZADO'
                ? styles.statusDoneText
                : styles.statusPendingText,
            ]}>
              {status}
            </Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </View>

        <Text style={styles.title} numberOfLines={2}>
          {maintenanceTitle(item)}
        </Text>

        <Text style={styles.location} numberOfLines={1}>
          ⌖ {maintenanceLocation(item)}
        </Text>

        <View style={styles.metaBox}>
          <Text style={styles.meta}>
            ◷ {formatMaintenanceDate(item.Fecha)}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            ♟ {maintenanceResponsible(item)}
          </Text>
        </View>

        {expected > 0 ? (
          <View style={styles.progressArea}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>Progreso de dispositivos</Text>
              <Text style={styles.progressValue}>
                {progress}% · {completed} de {expected}
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${progress}%` as `${number}%` },
                ]}
              />
            </View>
          </View>
        ) : null}

        <View style={styles.footer}>
          <Text style={styles.deviceCount}>
            ⚙ {completed} dispositivo{completed === 1 ? '' : 's'}
          </Text>
          <Text style={[
            styles.syncState,
            pending ? styles.syncPending : styles.syncReady,
          ]}>
            {pending
              ? '↑ Pendiente de sync'
              : meta.detailComplete
                ? '✓ Disponible offline'
                : 'Resumen guardado'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  accent: {
    width: 5,
  },
  accentPending: {
    backgroundColor: colors.warning,
  },
  accentDone: {
    backgroundColor: colors.success,
  },
  body: {
    flex: 1,
    minWidth: 0,
    padding: spacing.md,
    gap: spacing.xs,
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.995 }],
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  typeBadge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 7,
    backgroundColor: colors.surfaceHigh,
  },
  typeBadgeText: {
    color: colors.muted,
    fontWeight: '900',
    fontSize: 9,
    letterSpacing: 0.4,
  },
  statusChip: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 7,
  },
  statusPending: {
    backgroundColor: colors.warningSoft,
  },
  statusDone: {
    backgroundColor: colors.successSoft,
  },
  statusText: {
    fontWeight: '900',
    fontSize: 9,
  },
  statusPendingText: {
    color: colors.warning,
  },
  statusDoneText: {
    color: colors.success,
  },
  chevron: {
    marginLeft: 'auto',
    color: colors.muted,
    fontSize: 26,
    lineHeight: 27,
  },
  title: {
    color: colors.text,
    fontWeight: '900',
    fontSize: 19,
    lineHeight: 24,
    marginTop: 2,
  },
  location: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  metaBox: {
    marginTop: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceLow,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  meta: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '700',
  },
  progressArea: {
    marginTop: spacing.xs,
    gap: 6,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  progressLabel: {
    color: colors.muted,
    fontSize: 10,
  },
  progressValue: {
    color: colors.primary,
    fontWeight: '900',
    fontSize: 10,
  },
  progressTrack: {
    height: 7,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: colors.surfaceHigh,
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  footer: {
    minHeight: 30,
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.outlineSoft,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  deviceCount: {
    flex: 1,
    color: colors.muted,
    fontSize: 10,
    fontWeight: '700',
  },
  syncState: {
    fontSize: 9,
    fontWeight: '900',
  },
  syncPending: {
    color: colors.warning,
  },
  syncReady: {
    color: colors.success,
  },
});

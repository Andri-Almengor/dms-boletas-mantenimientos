import { useSync } from '@/sync/SyncProvider';
import { colors, radius, sizing, spacing } from '@/theme/tokens';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const STATUS_PRESENTATION = {
  UPDATED: {
    icon: '✓',
    title: 'Actualizado',
    background: colors.successSoft,
    foreground: colors.success,
  },
  PENDING: {
    icon: '↑',
    title: 'Cambios pendientes',
    background: colors.warningSoft,
    foreground: colors.warning,
  },
  OFFLINE: {
    icon: '☁',
    title: 'Sin conexión',
    background: colors.surfaceHigh,
    foreground: colors.muted,
  },
  PAUSED: {
    icon: '◷',
    title: 'Fuera de horario',
    background: colors.surfaceHigh,
    foreground: colors.muted,
  },
  ERROR: {
    icon: '!',
    title: 'Error de sincronización',
    background: colors.dangerSoft,
    foreground: colors.danger,
  },
  CONFLICT: {
    icon: '!',
    title: 'Conflicto pendiente',
    background: colors.dangerSoft,
    foreground: colors.danger,
  },
  SESSION_EXPIRED: {
    icon: '!',
    title: 'Sesión expirada',
    background: colors.dangerSoft,
    foreground: colors.danger,
  },
  BUSY: {
    icon: '↻',
    title: 'Sincronizando',
    background: colors.primarySoft,
    foreground: colors.primary,
  },
} as const;

export function SyncStatusCard() {
  const {
    status,
    message,
    pendingCount,
    syncing,
    syncNow,
  } = useSync();

  const presentation = STATUS_PRESENTATION[status];
  const title = pendingCount > 0 && status !== 'BUSY'
    ? `${pendingCount} cambio${pendingCount === 1 ? '' : 's'} pendiente${pendingCount === 1 ? '' : 's'}`
    : presentation.title;

  return (
    <View
      style={styles.card}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.mainRow}>
        <View style={[
          styles.iconBox,
          { backgroundColor: presentation.background },
        ]}>
          {syncing ? (
            <ActivityIndicator
              color={presentation.foreground}
              size="small"
            />
          ) : (
            <Text style={[
              styles.icon,
              { color: presentation.foreground },
            ]}>
              {presentation.icon}
            </Text>
          )}
        </View>

        <View style={styles.copy}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message} numberOfLines={2}>
            {message}
          </Text>
        </View>

        <Pressable
          onPress={syncNow}
          disabled={syncing}
          style={({ pressed }) => [
            styles.button,
            pressed && !syncing && styles.buttonPressed,
            syncing && styles.buttonDisabled,
          ]}
        >
          <Text style={styles.buttonGlyph}>{syncing ? '↻' : '↕'}</Text>
          <Text style={styles.buttonText}>
            {syncing ? 'En curso' : 'Sincronizar'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.scheduleRow}>
        <Text style={styles.scheduleIcon}>◷</Text>
        <Text style={styles.caption}>
          Automática 07:00–17:00 (Costa Rica) · Manual disponible siempre
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    gap: spacing.sm,
  },
  mainRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 20,
    fontWeight: '900',
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    color: colors.text,
    fontWeight: '900',
    fontSize: 14,
  },
  message: {
    color: colors.muted,
    lineHeight: 16,
    fontSize: 10,
  },
  button: {
    minHeight: sizing.touchTargetMin,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  buttonPressed: {
    opacity: 0.78,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonGlyph: {
    color: colors.primary,
    fontWeight: '900',
    fontSize: 15,
  },
  buttonText: {
    color: colors.text,
    fontWeight: '900',
    fontSize: 10,
  },
  scheduleRow: {
    minHeight: 32,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceLow,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  scheduleIcon: {
    color: colors.muted,
    fontWeight: '900',
    fontSize: 12,
  },
  caption: {
    flex: 1,
    color: colors.muted,
    fontSize: 9,
    lineHeight: 13,
  },
});

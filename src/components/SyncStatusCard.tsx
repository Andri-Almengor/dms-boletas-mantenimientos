import { useSync } from '@/sync/SyncProvider';
import { colors, sizing } from '@/theme/tokens';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
} from 'react-native';

const STATUS_TONE = {
  UPDATED: {
    background: colors.primarySoft,
    foreground: colors.primary,
    border: colors.outlineSoft,
  },
  PENDING: {
    background: colors.warningSoft,
    foreground: colors.warning,
    border: colors.warning,
  },
  OFFLINE: {
    background: colors.surfaceHigh,
    foreground: colors.muted,
    border: colors.outlineSoft,
  },
  PAUSED: {
    background: colors.surfaceHigh,
    foreground: colors.muted,
    border: colors.outlineSoft,
  },
  ERROR: {
    background: colors.dangerSoft,
    foreground: colors.danger,
    border: colors.danger,
  },
  CONFLICT: {
    background: colors.dangerSoft,
    foreground: colors.danger,
    border: colors.danger,
  },
  SESSION_EXPIRED: {
    background: colors.dangerSoft,
    foreground: colors.danger,
    border: colors.danger,
  },
  BUSY: {
    background: colors.primarySoft,
    foreground: colors.primary,
    border: colors.primary,
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

  const tone = STATUS_TONE[status];
  const pendingLabel = pendingCount > 0
    ? ` ${pendingCount} cambio${pendingCount === 1 ? '' : 's'} pendiente${pendingCount === 1 ? '' : 's'}.`
    : '';

  return (
    <Pressable
      onPress={syncNow}
      disabled={syncing}
      accessibilityRole="button"
      accessibilityLabel={`Sincronizar ahora. ${message}.${pendingLabel}`}
      accessibilityState={{ busy: syncing, disabled: syncing }}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: tone.background,
          borderColor: tone.border,
        },
        pressed && !syncing && styles.pressed,
        syncing && styles.disabled,
      ]}
    >
      {syncing ? (
        <ActivityIndicator color={tone.foreground} size="small" />
      ) : (
        <Text style={[styles.icon, { color: tone.foreground }]}>↻</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: sizing.touchTargetMin,
    height: sizing.touchTargetMin,
    borderRadius: sizing.touchTargetMin / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.96 }],
  },
  disabled: {
    opacity: 0.72,
  },
});

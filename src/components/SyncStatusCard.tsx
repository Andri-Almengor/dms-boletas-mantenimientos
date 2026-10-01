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
  UPDATED: { icon: '✓', title: 'Actualizado' },
  PENDING: { icon: '⏳', title: 'Pendiente' },
  OFFLINE: { icon: '☁', title: 'Sin conexión' },
  PAUSED: { icon: '🌙', title: 'Fuera de horario' },
  ERROR: { icon: '⚠', title: 'Error' },
  CONFLICT: { icon: '⚠', title: 'Conflicto' },
  SESSION_EXPIRED: { icon: '🔐', title: 'Sesión expirada' },
  BUSY: { icon: '↻', title: 'Sincronizando' },
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

  return (
    <View style={styles.card}>
      <View style={styles.heading}>
        <Text style={styles.icon}>{presentation.icon}</Text>
        <View style={styles.headingText}>
          <Text style={styles.title}>{presentation.title}</Text>
          <Text style={styles.message}>{message}</Text>
        </View>
      </View>

      {pendingCount > 0 && status !== 'PENDING' ? (
        <Text style={styles.pending}>
          {pendingCount} cambio{pendingCount === 1 ? '' : 's'} pendiente{pendingCount === 1 ? '' : 's'}
        </Text>
      ) : null}

      <Pressable
        onPress={syncNow}
        disabled={syncing}
        style={({ pressed }) => [
          styles.button,
          pressed && !syncing && styles.buttonPressed,
          syncing && styles.buttonDisabled,
        ]}
      >
        {syncing ? (
          <>
            <ActivityIndicator color="#ffffff" />
            <Text style={styles.buttonText}>Sincronizando…</Text>
          </>
        ) : (
          <Text style={styles.buttonText}>Sincronizar ahora</Text>
        )}
      </Pressable>

      <Text style={styles.caption}>
        Automática: 07:00–17:00 · Manual: 24 horas
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceCard,
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineSoft,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  headingText: { flex: 1, gap: 2 },
  icon: { fontSize: 20 },
  title: { color: colors.text, fontWeight: '800', fontSize: 17 },
  message: { color: colors.muted, lineHeight: 20 },
  pending: { color: colors.warning, fontWeight: '700' },
  button: {
    minHeight: sizing.buttonHeight,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  buttonPressed: { opacity: 0.86 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#ffffff', fontWeight: '800', fontSize: 15 },
  caption: { color: colors.muted, fontSize: 12, textAlign: 'center' },
});

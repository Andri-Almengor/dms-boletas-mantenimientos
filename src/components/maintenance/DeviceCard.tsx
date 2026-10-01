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
  onPress: () => void;
};

function value(
  item: Record<string, unknown>,
  keys: string[],
  fallback = '',
) {
  for (const key of keys) {
    const current = item[key];
    if (
      current !== undefined
      && current !== null
      && String(current).trim()
    ) {
      return String(current).trim();
    }
  }
  return fallback;
}

function localSyncStatus(item: Record<string, unknown>) {
  const local = item.__local;
  if (!local || typeof local !== 'object') return '';
  return String(
    (local as { syncStatus?: string }).syncStatus || '',
  ).toUpperCase();
}

export function DeviceCard({ item, onPress }: Props) {
  const images = Array.isArray(item.Imagenes) ? item.Imagenes : [];
  const state = value(item, ['Estado', 'estado'], 'Pendiente');
  const category = value(
    item,
    ['TipoDispositivo', 'Categoria', 'categoria'],
    'Dispositivo',
  );
  const manufacturer = value(item, ['Fabricante', 'fabricante']);
  const model = value(item, ['Modelo', 'modelo']);
  const serial = value(item, ['Serie', 'serie']);
  const syncStatus = localSyncStatus(item);
  const pending = Boolean(syncStatus && syncStatus !== 'SYNCED');
  const good = ['BUENO', 'FUNCIONAL', 'OK', 'ACTIVO', 'CORRECTO']
    .includes(state.toUpperCase());

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.icon}>
        <Text style={styles.iconText}>▣</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {value(
              item,
              ['NombreDispositivo', 'nombre'],
              'Dispositivo',
            )}
          </Text>
          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText} numberOfLines={1}>
              {manufacturer || category}
            </Text>
          </View>
        </View>

        <Text style={styles.subtitle} numberOfLines={1}>
          {[category, model].filter(Boolean).join(' · ')}
        </Text>

        <View style={styles.metaRow}>
          <Text style={styles.meta} numberOfLines={1}>
            {serial ? `S/N: ${serial}` : 'Sin serie'}
          </Text>
          <Text style={styles.dot}>•</Text>
          <Text style={styles.meta}>
            ▧ {images.length}
          </Text>
        </View>
      </View>

      <View style={styles.end}>
        <View style={[
          styles.syncChip,
          pending ? styles.syncPending : styles.syncReady,
        ]}>
          <Text style={[
            styles.syncText,
            pending ? styles.syncPendingText : styles.syncReadyText,
          ]}>
            {pending ? '↑ PEND.' : '✓ SYNC'}
          </Text>
        </View>
        {!pending && state && !good ? (
          <Text style={styles.stateText} numberOfLines={1}>
            {state}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.md,
    marginTop: 5,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    backgroundColor: colors.surfaceLow,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pressed: {
    opacity: 0.76,
  },
  icon: {
    width: 42,
    height: 42,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    color: colors.primary,
    fontSize: 17,
    fontWeight: '900',
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    flexShrink: 1,
    color: colors.text,
    fontWeight: '900',
    fontSize: 14,
  },
  typeBadge: {
    maxWidth: 82,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: colors.surfaceHigh,
  },
  typeBadgeText: {
    color: colors.muted,
    fontSize: 8,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 9,
    marginTop: 3,
  },
  metaRow: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  meta: {
    color: colors.muted,
    fontSize: 9,
  },
  dot: {
    color: colors.outline,
    fontSize: 8,
  },
  end: {
    alignItems: 'flex-end',
    gap: 4,
  },
  syncChip: {
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: radius.sm,
  },
  syncPending: {
    backgroundColor: colors.warningSoft,
  },
  syncReady: {
    backgroundColor: colors.successSoft,
  },
  syncText: {
    fontSize: 8,
    fontWeight: '900',
  },
  syncPendingText: {
    color: colors.warning,
  },
  syncReadyText: {
    color: colors.success,
  },
  stateText: {
    maxWidth: 80,
    color: colors.muted,
    fontSize: 8,
  },
});

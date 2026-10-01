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

function value(item: Record<string, unknown>, keys: string[], fallback = '') {
  for (const key of keys) {
    const current = item[key];
    if (current !== undefined && current !== null && String(current).trim()) {
      return String(current);
    }
  }
  return fallback;
}

export function DeviceCard({ item, onPress }: Props) {
  const images = Array.isArray(item.Imagenes) ? item.Imagenes : [];
  const state = value(item, ['Estado', 'estado'], 'Pendiente');
  const good = ['BUENO', 'FUNCIONAL', 'OK', 'ACTIVO'].includes(state.toUpperCase());

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.icon}>
        <Text style={styles.iconText}>⚙</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {value(item, ['NombreDispositivo', 'nombre'], 'Dispositivo')}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {[
            value(item, ['Zona', 'zona']),
            value(item, ['Fabricante', 'fabricante']),
            value(item, ['Modelo', 'modelo']),
          ].filter(Boolean).join(' · ') || 'Sin datos adicionales'}
        </Text>
        <Text style={styles.evidence}>
          {images.length} evidencia{images.length === 1 ? '' : 's'}
        </Text>
      </View>
      <View style={styles.end}>
        <View style={[styles.state, good && styles.stateGood]}>
          <Text style={[styles.stateText, good && styles.stateGoodText]}>
            {state}
          </Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.md,
    marginVertical: 5,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineSoft,
    backgroundColor: colors.surfaceCard,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pressed: { opacity: 0.78 },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: { color: colors.primary, fontSize: 20 },
  body: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontWeight: '800', fontSize: 15 },
  subtitle: { color: colors.muted, fontSize: 11, marginTop: 3 },
  evidence: { color: colors.primary, fontWeight: '700', fontSize: 10, marginTop: 4 },
  end: { alignItems: 'flex-end', gap: 2 },
  state: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.surfaceLow,
    maxWidth: 90,
  },
  stateGood: { backgroundColor: colors.successSoft },
  stateText: { color: colors.muted, fontWeight: '800', fontSize: 9 },
  stateGoodText: { color: colors.success },
  chevron: { color: colors.primary, fontSize: 24, lineHeight: 24 },
});

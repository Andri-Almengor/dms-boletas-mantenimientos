import { useAuth } from '@/auth/AuthProvider';
import {
  getAutomaticSyncWindowLabel,
  isAutomaticSyncWindow,
} from '@/sync/syncPolicy';
import { colors, radius, sizing, spacing } from '@/theme/tokens';
import { Redirect } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!user) return <Redirect href="/login" />;
  if (user.CambioPasswordObligatorio) return <Redirect href="/change-password" />;

  const automaticWindow = isAutomaticSyncWindow();

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.container}>
        <View>
          <Text style={styles.eyebrow}>DMS Mantenimientos</Text>
          <Text style={styles.title}>Trabajo local-first</Text>
          <Text style={styles.subtitle}>
            La base móvil usa SQLite y conserva el contrato del backend de DMS Boletas.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Base local</Text>
          <Text style={styles.statusSuccess}>✓ SQLite preparado</Text>
          <Text style={styles.muted}>
            Las tablas operativas y la outbox se incorporan en la Etapa 2.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Política de sincronización</Text>
          <Text style={automaticWindow ? styles.statusSuccess : styles.statusPaused}>
            {automaticWindow ? '✓' : '🌙'} {getAutomaticSyncWindowLabel()}
          </Text>
          <Text style={styles.muted}>
            Automática: 07:00–17:00 · Manual: 24 horas.
          </Text>
          <Text style={styles.muted}>
            El motor PULL → reconciliación → PUSH → PULL final se activa en una etapa posterior.
          </Text>
        </View>

        <Pressable
          onPress={logout}
          style={({ pressed }) => [styles.secondaryButton, pressed && { opacity: 0.75 }]}
        >
          <Text style={styles.secondaryButtonText}>Cerrar sesión</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  container: { padding: spacing.md, gap: spacing.md },
  eyebrow: {
    color: colors.primary,
    fontWeight: '800',
    textTransform: 'uppercase',
    fontSize: 12,
  },
  title: { color: colors.text, fontSize: 28, fontWeight: '800', marginTop: spacing.xs },
  subtitle: { color: colors.muted, lineHeight: 21, marginTop: spacing.xs },
  card: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceCard,
    gap: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineSoft,
  },
  cardTitle: { color: colors.text, fontWeight: '800', fontSize: 17 },
  statusSuccess: { color: colors.success, fontWeight: '700' },
  statusPaused: { color: colors.variant, fontWeight: '700' },
  muted: { color: colors.muted, lineHeight: 20 },
  secondaryButton: {
    minHeight: sizing.buttonHeight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceCard,
  },
  secondaryButtonText: { color: colors.text, fontWeight: '700' },
});

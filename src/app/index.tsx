import { useAuth } from '@/auth/AuthProvider';
import { SyncStatusCard } from '@/components/SyncStatusCard';
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

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.container}>
        <View>
          <Text style={styles.eyebrow}>DMS Mantenimientos</Text>
          <Text style={styles.title}>Trabajo local-first</Text>
          <Text style={styles.subtitle}>
            Los cambios se guardan primero en SQLite. La sincronización no bloquea el trabajo local.
          </Text>
        </View>

        <SyncStatusCard />

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Etapa 3 activa</Text>
          <Text style={styles.statusSuccess}>
            ✓ PULL → reconciliación → PUSH → PULL final
          </Text>
          <Text style={styles.muted}>
            El botón manual funciona a cualquier hora. Los triggers automáticos y BackgroundTask todavía no están registrados.
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

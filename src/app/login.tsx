import { useAuth } from '@/auth/AuthProvider';
import { colors, radius, sizing, spacing } from '@/theme/tokens';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function LoginScreen() {
  const { user, loading, login } = useAuth();
  const params = useLocalSearchParams<{ changed?: string }>();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!loading && user) return <Redirect href="/" />;

  async function submit() {
    if (!username.trim() || !password) return;
    setError('');
    setSubmitting(true);

    try {
      const data = await login(username.trim(), password);
      const forced = Boolean(
        data.mustChangePassword || data.user?.CambioPasswordObligatorio,
      );
      router.replace(forced ? '/change-password' : '/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.container}>
          <View style={styles.brand}>
            <View style={styles.brandMark}>
              <Text style={styles.brandMarkText}>DMS</Text>
            </View>
            <Text style={styles.title}>DMS Mantenimientos</Text>
            <Text style={styles.subtitle}>
              Acceso seguro para trabajo local-first.
            </Text>
          </View>

          <View style={styles.card}>
            {params.changed === '1' ? (
              <View style={styles.successBox}>
                <Text style={styles.successText}>
                  Contraseña actualizada. Inicia sesión nuevamente.
                </Text>
              </View>
            ) : null}

            <Text style={styles.label}>Usuario o correo</Text>
            <TextInput
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              placeholder="nombre@empresa.com"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />

            <Text style={styles.label}>Contraseña</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
              placeholder="••••••••"
              placeholderTextColor={colors.muted}
              style={styles.input}
              onSubmitEditing={submit}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              onPress={submit}
              disabled={submitting || !username.trim() || !password}
              style={({ pressed }) => [
                styles.button,
                pressed && styles.buttonPressed,
                (submitting || !username.trim() || !password) && styles.buttonDisabled,
              ]}
            >
              {submitting
                ? <ActivityIndicator color="#ffffff" />
                : <Text style={styles.buttonText}>Ingresar</Text>}
            </Pressable>
          </View>

          <Text style={styles.footer}>DMS Boletas · Conexión segura</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: colors.surface },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    gap: spacing.lg,
  },
  brand: { alignItems: 'center', gap: spacing.xs },
  brandMark: {
    minWidth: 72,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  brandMarkText: { color: '#ffffff', fontWeight: '800', fontSize: 18 },
  title: { color: colors.text, fontSize: 28, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 15, textAlign: 'center' },
  card: {
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineSoft,
  },
  label: { color: colors.text, fontSize: 14, fontWeight: '700' },
  input: {
    minHeight: sizing.controlHeight,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    color: colors.text,
    backgroundColor: colors.surfaceCard,
    fontSize: 16,
  },
  button: {
    minHeight: sizing.buttonHeight,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    marginTop: spacing.xs,
  },
  buttonPressed: { opacity: 0.86 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#ffffff', fontWeight: '800', fontSize: 16 },
  error: { color: colors.danger, fontSize: 14 },
  successBox: {
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.successSoft,
  },
  successText: { color: colors.success, fontWeight: '700' },
  footer: { color: colors.muted, textAlign: 'center', fontSize: 12 },
});

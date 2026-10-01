import { actionRequest } from '@/api/actionClient';
import { useAuth } from '@/auth/AuthProvider';
import { colors, radius, sizing, spacing } from '@/theme/tokens';
import { Redirect, router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ChangePasswordScreen() {
  const { user, sessionToken, clearSession } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!user || !sessionToken) return <Redirect href="/login" />;

  async function submit() {
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Las contraseñas nuevas no coinciden.');
      return;
    }

    if (newPassword.length < 8) {
      setError('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }

    setSubmitting(true);
    try {
      await actionRequest(
        'auth.changePassword',
        { currentPassword, newPassword },
        sessionToken,
      );
      await clearSession();
      router.replace({ pathname: '/login', params: { changed: '1' } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar la contraseña.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.container}>
        {user.CambioPasswordObligatorio ? (
          <View style={styles.warning}>
            <Text style={styles.warningText}>
              Debes cambiar la contraseña temporal antes de continuar.
            </Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.title}>Nueva credencial</Text>
          <Text style={styles.help}>
            Debe incluir al menos 8 caracteres, una mayúscula, una minúscula y un número.
          </Text>

          <PasswordField
            label="Contraseña actual"
            value={currentPassword}
            onChangeText={setCurrentPassword}
          />
          <PasswordField
            label="Nueva contraseña"
            value={newPassword}
            onChangeText={setNewPassword}
          />
          <PasswordField
            label="Confirmar contraseña"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            onPress={submit}
            disabled={submitting}
            style={({ pressed }) => [
              styles.button,
              pressed && { opacity: 0.86 },
              submitting && { opacity: 0.5 },
            ]}
          >
            {submitting
              ? <ActivityIndicator color="#ffffff" />
              : <Text style={styles.buttonText}>Cambiar contraseña</Text>}
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

function PasswordField({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        secureTextEntry
        autoCapitalize="none"
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  container: { padding: spacing.md, gap: spacing.md },
  warning: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.warningSoft,
  },
  warningText: { color: colors.warning, fontWeight: '700' },
  card: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceCard,
    gap: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineSoft,
  },
  title: { color: colors.text, fontWeight: '800', fontSize: 22 },
  help: { color: colors.muted, lineHeight: 20 },
  field: { gap: spacing.xs },
  label: { color: colors.text, fontWeight: '700' },
  input: {
    minHeight: sizing.controlHeight,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    color: colors.text,
  },
  error: { color: colors.danger },
  button: {
    minHeight: sizing.buttonHeight,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#ffffff', fontWeight: '800' },
});

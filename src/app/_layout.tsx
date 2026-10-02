import { AuthProvider } from '@/auth/AuthProvider';
import {
  DATABASE_NAME,
  initializeDatabase,
} from '@/db/database';
import '@/sync/backgroundSyncTask';
import { SyncProvider } from '@/sync/SyncProvider';
import { colors } from '@/theme/tokens';
import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SQLiteProvider
        databaseName={DATABASE_NAME}
        onInit={initializeDatabase}
      >
        <AuthProvider>
          <SyncProvider>
            <StatusBar style="auto" />
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: colors.surfaceCard },
                headerTintColor: colors.text,
                headerBackTitle: 'Atrás',
                contentStyle: { backgroundColor: colors.surface },
              }}
            >
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="login" options={{ headerShown: false }} />
              <Stack.Screen
                name="change-password"
                options={{ title: 'Cambiar contraseña' }}
              />
            </Stack>
          </SyncProvider>
        </AuthProvider>
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}

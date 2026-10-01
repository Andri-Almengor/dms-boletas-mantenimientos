import { SignaturePad } from '@/components/SignaturePad';
import {
  queueLocalMaintenanceFinalization,
} from '@/db/maintenanceFinalizationRepository';
import {
  LocalMaintenanceSignature,
  readLocalMaintenanceSignature,
} from '@/db/maintenanceSignatureRepository';
import {
  canAccessMaintenanceSignature,
  canFinalizeMaintenance,
} from '@/features/maintenance/maintenancePermissions';
import {
  maintenanceHasServerSignature,
  SignatureDraft,
} from '@/features/maintenance/maintenanceSignature';
import {
  persistMaintenanceSignatureDraft,
} from '@/services/maintenanceSignatureStorage';
import { colors, radius, sizing, spacing } from '@/theme/tokens';
import { useSQLiteContext } from 'expo-sqlite';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type Props = {
  maintenanceId: string;
  maintenance: Record<string, unknown>;
  scopeKey: string;
  permissions: string[];
  syncing?: boolean;
  onChanged?: () => void | Promise<void>;
};

function text(value: unknown) {
  return String(value ?? '').trim();
}

function normalizedStatus(value: unknown) {
  const status = text(value).toUpperCase();
  return status === 'FINALIZADA' ? 'FINALIZADO' : status;
}

export function MaintenanceCompletionCard({
  maintenanceId,
  maintenance,
  scopeKey,
  permissions,
  syncing = false,
  onChanged,
}: Props) {
  const db = useSQLiteContext();
  const [draft, setDraft] = useState<SignatureDraft | null>(null);
  const [signature, setSignature] = useState<LocalMaintenanceSignature | null>(null);
  const [savingSignature, setSavingSignature] = useState(false);
  const [queueingFinalization, setQueueingFinalization] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadSignature = useCallback(async () => {
    setSignature(await readLocalMaintenanceSignature(
      db,
      scopeKey,
      maintenanceId,
    ));
  }, [db, maintenanceId, scopeKey]);

  useEffect(() => {
    loadSignature().catch(() => undefined);
  }, [loadSignature]);

  const canSign = canAccessMaintenanceSignature(permissions);
  const canFinalize = canFinalizeMaintenance(permissions);
  const serverSigned = maintenanceHasServerSignature(maintenance);
  const signatureSynced = serverSigned || signature?.syncStatus === 'SYNCED';
  const signaturePending = !signatureSynced && signature?.syncStatus === 'PENDING';
  const status = normalizedStatus(maintenance.Estado);
  const finalizationState = text(maintenance.EstadoFinalizacion).toUpperCase();
  const finalizationPending = Boolean(maintenance.FinalizacionPendiente)
    || finalizationState === 'PENDIENTE_SINCRONIZACION';
  const finalizationActive = finalizationPending
    || ['EN_PROCESO', 'PROGRAMADO'].includes(finalizationState);
  const finalized = status === 'FINALIZADO'
    || finalizationState === 'COMPLETADO';

  const finalizationLabel = useMemo(() => {
    if (finalized) return 'Mantenimiento finalizado';
    if (finalizationPending) return 'Finalización pendiente de sincronizar';
    if (finalizationState === 'EN_PROCESO') return 'Finalización en proceso';
    if (finalizationState === 'PROGRAMADO') return 'Finalización programada';
    if (finalizationState === 'ERROR') return 'Reintentar finalización';
    return 'Finalizar mantenimiento';
  }, [finalizationPending, finalizationState, finalized]);

  if (!canSign && !canFinalize) return null;

  async function changed() {
    await loadSignature();
    await onChanged?.();
  }

  async function saveSignature() {
    if (!canSign || !draft || savingSignature || syncing || finalized) return;
    setSavingSignature(true);
    setError('');
    setMessage('');
    try {
      await persistMaintenanceSignatureDraft(db, {
        scopeKey,
        maintenanceId,
        draft,
      });
      setDraft(null);
      setMessage(
        'Firma guardada en este dispositivo. Se enviará en la próxima sincronización permitida o manual.',
      );
      await changed();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'No se pudo guardar la firma local.',
      );
    } finally {
      setSavingSignature(false);
    }
  }

  async function queueFinalization() {
    if (!canFinalize || queueingFinalization || syncing || finalized) return;
    setQueueingFinalization(true);
    setError('');
    setMessage('');
    try {
      const result = await queueLocalMaintenanceFinalization(db, {
        scopeKey,
        maintenanceId,
      });
      setMessage(
        result.alreadyFinalized
          ? 'El mantenimiento ya estaba finalizado.'
          : 'La finalización quedó guardada localmente. Primero se sincronizarán los cambios, evidencias y firma pendientes.',
      );
      await changed();
    } catch (queueError) {
      setError(
        queueError instanceof Error
          ? queueError.message
          : 'No se pudo registrar la finalización local.',
      );
    } finally {
      setQueueingFinalization(false);
    }
  }

  function confirmFinalization() {
    Alert.alert(
      'Finalizar mantenimiento',
      signatureSynced || signaturePending
        ? 'La firma registrada se sincronizará antes de finalizar. Los demás cambios y evidencias pendientes también deben completarse primero.'
        : 'La firma es opcional. Si finaliza sin firma, el backend generará las boletas y PDF sin firma del cliente, conservando la política actual.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: finalizationState === 'ERROR' ? 'Reintentar' : 'Finalizar',
          style: 'destructive',
          onPress: () => {
            queueFinalization().catch(() => undefined);
          },
        },
      ],
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.heading}>
        <Text style={styles.title}>Firma y finalización</Text>
        <Text style={styles.description}>
          Todo se guarda primero en SQLite. Guardar aquí no inicia una sincronización automática.
        </Text>
      </View>

      {canSign ? (
        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>Firma general del cliente</Text>
            <View style={[
              styles.badge,
              signatureSynced
                ? styles.badgeDone
                : signaturePending
                  ? styles.badgePending
                  : styles.badgeNeutral,
            ]}>
              <Text style={styles.badgeText}>
                {signatureSynced
                  ? 'Registrada'
                  : signaturePending
                    ? 'Pendiente'
                    : 'Opcional'}
              </Text>
            </View>
          </View>

          {signature?.localUri ? (
            <Image
              source={{ uri: signature.localUri }}
              resizeMode="contain"
              style={styles.signaturePreview}
            />
          ) : null}

          {!signatureSynced && !finalized ? (
            <>
              <Text style={styles.hint}>
                Puede firmar con dedo, stylus o mouse, o cargar una imagen PNG/JPEG.
              </Text>
              <SignaturePad
                value={draft}
                onChange={setDraft}
                disabled={syncing || savingSignature}
              />
              <Pressable
                onPress={saveSignature}
                disabled={!draft || syncing || savingSignature}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.pressed,
                  (!draft || syncing || savingSignature) && styles.disabled,
                ]}
              >
                {savingSignature ? <ActivityIndicator color="#fff" /> : null}
                <Text style={styles.primaryButtonText}>
                  {savingSignature ? 'Guardando firma...' : 'Guardar firma local'}
                </Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.hint}>
              {finalized
                ? 'El mantenimiento está finalizado y se conserva en modo de solo lectura.'
                : 'La firma ya fue confirmada y no se reemplaza desde este flujo móvil.'}
            </Text>
          )}
        </View>
      ) : null}

      {canFinalize ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cierre del mantenimiento</Text>
          <Text style={styles.hint}>
            La firma no es obligatoria. El cierre espera cualquier cambio, evidencia o firma pendiente del mismo mantenimiento antes de llamar al backend.
          </Text>
          <Pressable
            onPress={confirmFinalization}
            disabled={syncing || queueingFinalization || finalizationActive || finalized}
            style={({ pressed }) => [
              styles.finalizeButton,
              pressed && styles.pressed,
              (syncing || queueingFinalization || finalizationActive || finalized)
                && styles.disabled,
            ]}
          >
            {queueingFinalization ? <ActivityIndicator color="#fff" /> : null}
            <Text style={styles.primaryButtonText}>
              {queueingFinalization ? 'Guardando solicitud...' : finalizationLabel}
            </Text>
          </Pressable>
          {finalizationState === 'ERROR' && text(maintenance.UltimoErrorFinalizacion) ? (
            <Text style={styles.error}>{text(maintenance.UltimoErrorFinalizacion)}</Text>
          ) : null}
        </View>
      ) : null}

      {message ? <Text style={styles.notice}>{message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineSoft,
    gap: spacing.md,
  },
  heading: { gap: 4 },
  title: { color: colors.text, fontSize: 18, fontWeight: '900' },
  description: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  section: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.outlineSoft,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  sectionTitle: { color: colors.text, fontWeight: '900', fontSize: 14 },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  badgeDone: { backgroundColor: colors.successSoft },
  badgePending: { backgroundColor: colors.warningSoft },
  badgeNeutral: { backgroundColor: colors.surfaceLow },
  badgeText: { color: colors.text, fontSize: 10, fontWeight: '900' },
  signaturePreview: {
    height: 120,
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: radius.sm,
  },
  primaryButton: {
    minHeight: sizing.buttonHeight,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  finalizeButton: {
    minHeight: sizing.buttonHeight,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  primaryButtonText: { color: '#fff', fontWeight: '900', textAlign: 'center' },
  notice: {
    color: colors.success,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  error: {
    color: colors.danger,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.82 },
});

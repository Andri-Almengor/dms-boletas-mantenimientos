import { OptionSheet } from '@/components/forms/OptionSheet';
import { EvidenceLightbox } from '@/components/maintenance/EvidenceLightbox';
import { MaintenanceEvidencePickerControls } from '@/components/maintenance/MaintenanceEvidencePickerControls';
import { useAuth } from '@/auth/AuthProvider';
import {
  deleteLocalEvidence,
  EvidenceRecord,
  listLocalEvidence,
  saveLocalEvidence,
} from '@/db/evidenceRepository';
import {
  createEvidencePayload,
  evidenceMediaKind,
  normalizeEvidenceType,
  projectEvidenceTargetPatch,
  projectEvidenceTargets,
  projectEvidenceTargetValue,
  ProjectEvidenceTarget,
} from '@/features/maintenance/maintenanceEvidence';
import { isProjectMaintenance } from '@/features/maintenance/maintenanceProject';
import {
  cacheRemoteEvidence,
  discardRegisteredEvidenceFile,
  persistPickedEvidenceAsset,
  removeLocalEvidenceFile,
} from '@/services/maintenanceEvidenceStorage';
import { useSync } from '@/sync/SyncProvider';
import { colors, radius, sizing, spacing } from '@/theme/tokens';
import { createLocalId } from '@/utils/localId';
import type { ImagePickerAsset } from 'expo-image-picker';
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
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type RecordLike = Record<string, unknown>;

type Props = {
  maintenanceId: string;
  deviceId: string;
  device: RecordLike;
  maintenanceType: unknown;
  readOnly?: boolean;
};

type LocalMeta = {
  syncStatus?: string;
  localUri?: string;
  localFileId?: string;
};

type PreviewState = {
  uri: string;
  mediaType: 'image' | 'video';
  title: string;
} | null;

function text(value: unknown) {
  return String(value ?? '').trim();
}

function idOf(item: RecordLike) {
  return text(
    item.FotoDispositivoID
      || item.imageId
      || item.id,
  );
}

function localMeta(item: RecordLike): LocalMeta {
  return item.__local
    && typeof item.__local === 'object'
    && !Array.isArray(item.__local)
      ? item.__local as LocalMeta
      : {};
}

function displayType(item: RecordLike, projectMode: boolean) {
  if (projectMode) {
    return text(
      item.ProyectoComponenteNombre
        || item.projectComponentName,
    ) || 'Dispositivo';
  }
  return normalizeEvidenceType(item.Tipo || item.tipo);
}

function syncLabel(value: unknown) {
  const status = text(value).toUpperCase();
  if (status === 'LOCAL_ONLY') return 'Local';
  if (status === 'PENDING') return 'Pendiente';
  if (status === 'CONFLICT') return 'Conflicto';
  if (status === 'FAILED' || status === 'BLOCKED') return 'Error';
  return 'Sincronizado';
}

function evidenceTitle(item: RecordLike) {
  return text(item.Nombre || item.fileName) || 'Evidencia';
}

export function MaintenanceEvidenceManager({
  maintenanceId,
  deviceId,
  device,
  maintenanceType,
  readOnly = false,
}: Props) {
  const db = useSQLiteContext();
  const {
    dataScope,
    sessionToken,
  } = useAuth();
  const { refreshStatus } = useSync();

  const [items, setItems] = useState<EvidenceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [newType, setNewType] = useState('Antes');
  const [newTargetValue, setNewTargetValue] = useState('DISPOSITIVO');
  const [editing, setEditing] = useState<EvidenceRecord | null>(null);
  const [editType, setEditType] = useState('Antes');
  const [editTargetValue, setEditTargetValue] = useState('DISPOSITIVO');
  const [editNote, setEditNote] = useState('');
  const [preview, setPreview] = useState<PreviewState>(null);

  const projectMode = isProjectMaintenance(maintenanceType);
  const targets = useMemo(
    () => projectMode ? projectEvidenceTargets(device) : [],
    [device, projectMode],
  );
  const targetOptions = useMemo(
    () => targets.map((target) => ({
      value: target.value,
      label: target.label,
    })),
    [targets],
  );

  const load = useCallback(async () => {
    if (!dataScope || !deviceId) return;
    const evidence = await listLocalEvidence(
      db,
      dataScope,
      deviceId,
    );
    setItems(evidence);
    setLoading(false);
  }, [db, dataScope, deviceId]);

  useEffect(() => {
    setLoading(true);
    load().catch((loadError) => {
      setLoading(false);
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'No se pudieron leer las evidencias locales.',
      );
    });
  }, [load]);

  const persistAssets = useCallback(async (
    assets: ImagePickerAsset[],
  ) => {
    if (!assets.length || !dataScope || readOnly) return;

    setError('');
    let saved = 0;
    const failures: string[] = [];

    for (const asset of assets) {
      const evidenceId = createLocalId('evidencia');
      let stored:
        | Awaited<ReturnType<typeof persistPickedEvidenceAsset>>
        | null = null;

      try {
        stored = await persistPickedEvidenceAsset({
          evidenceId,
          asset,
        });

        const target = projectMode
          ? targets.find(
              (candidate) => candidate.value === newTargetValue,
            ) || targets[0] || null
          : null;

        const payload = createEvidencePayload({
          evidenceId,
          maintenanceId,
          deviceId,
          asset,
          type: newType,
          projectMode,
          target,
        });

        await saveLocalEvidence(
          db,
          dataScope,
          {
            maintenanceId,
            deviceId,
            localFileId: stored.localFileId,
            localFile: {
              localUri: stored.localUri,
              fileName: stored.metadata.fileName,
              mimeType: stored.metadata.mimeType,
              fileSize: stored.metadata.size,
            },
            patch: {
              ...payload,
              Size: stored.metadata.size,
              size: stored.metadata.size,
            },
          },
        );
        saved += 1;
      } catch (saveError) {
        failures.push(
          saveError instanceof Error
            ? saveError.message
            : 'No se pudo guardar una evidencia.',
        );

        if (stored) {
          await discardRegisteredEvidenceFile(
            db,
            dataScope,
            stored.localFileId,
            stored.localUri,
          );
        }
      }
    }

    await load();
    await refreshStatus();

    if (failures.length) {
      setError(
        saved
          ? `${saved} evidencia(s) guardada(s). ${failures.length} no pudieron guardarse: ${failures[0]}`
          : failures[0],
      );
    }
  }, [
    dataScope,
    db,
    deviceId,
    load,
    maintenanceId,
    newTargetValue,
    newType,
    projectMode,
    readOnly,
    refreshStatus,
    targets,
  ]);

  function openEditor(item: EvidenceRecord) {
    setEditing(item);
    setEditType(normalizeEvidenceType(item.Tipo || item.tipo));
    setEditTargetValue(projectEvidenceTargetValue(item));
    setEditNote(text(item.Nota || item.nota));
    setError('');
  }

  async function saveEditor() {
    if (!editing || !dataScope || readOnly) return;
    const evidenceId = idOf(editing);
    if (!evidenceId) return;

    setBusyId(evidenceId);
    setError('');
    try {
      const target = projectMode
        ? targets.find((candidate) => candidate.value === editTargetValue)
          || targets[0]
          || null
        : null;

      await saveLocalEvidence(
        db,
        dataScope,
        {
          maintenanceId,
          deviceId,
          patch: {
            ...editing,
            FotoDispositivoID: evidenceId,
            imageId: evidenceId,
            Tipo: projectMode ? 'Proyecto' : editType,
            tipo: projectMode ? 'Proyecto' : editType,
            Nota: editNote,
            nota: editNote,
            ...(projectMode
              ? projectEvidenceTargetPatch(target)
              : {}),
          },
        },
      );

      setEditing(null);
      await load();
      await refreshStatus();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'No se pudo editar la evidencia local.',
      );
    } finally {
      setBusyId('');
    }
  }

  function requestDelete(item: EvidenceRecord) {
    if (readOnly || !dataScope) return;
    const evidenceId = idOf(item);
    if (!evidenceId) return;

    Alert.alert(
      'Eliminar evidencia',
      'La evidencia se ocultará inmediatamente y la eliminación se sincronizará cuando corresponda.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            setBusyId(evidenceId);
            setError('');
            deleteLocalEvidence(
              db,
              dataScope,
              {
                maintenanceId,
                deviceId,
                evidenceId,
              },
            ).then(async (result) => {
              if (result.discardLocalUri) {
                await removeLocalEvidenceFile(result.discardLocalUri);
              }
              if (editing && idOf(editing) === evidenceId) {
                setEditing(null);
              }
              await load();
              await refreshStatus();
            }).catch((deleteError) => {
              setError(
                deleteError instanceof Error
                  ? deleteError.message
                  : 'No se pudo eliminar la evidencia local.',
              );
            }).finally(() => setBusyId(''));
          },
        },
      ],
    );
  }

  async function openPreview(item: EvidenceRecord) {
    if (!dataScope) return;
    const evidenceId = idOf(item);
    const meta = localMeta(item);
    let uri = text(meta.localUri);

    setError('');
    if (!uri) {
      if (!sessionToken) {
        setError('Inicie sesión para descargar esta evidencia del servidor.');
        return;
      }

      setBusyId(evidenceId);
      try {
        uri = await cacheRemoteEvidence(
          db,
          {
            scopeKey: dataScope,
            evidenceId,
            sessionToken,
          },
        );
        await load();
      } catch (downloadError) {
        setError(
          downloadError instanceof Error
            ? downloadError.message
            : 'No se pudo descargar la evidencia.',
        );
        setBusyId('');
        return;
      }
      setBusyId('');
    }

    setPreview({
      uri,
      mediaType: evidenceMediaKind(item),
      title: evidenceTitle(item),
    });
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.muted}>Leyendo evidencias locales…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.heading}>
        <View style={styles.headingText}>
          <Text style={styles.eyebrow}>Evidencias</Text>
          <Text style={styles.title}>
            {items.length} evidencia{items.length === 1 ? '' : 's'}
          </Text>
        </View>
        <View style={styles.count}>
          <Text style={styles.countText}>{items.length}</Text>
        </View>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {!readOnly ? (
        <MaintenanceEvidencePickerControls
          projectMode={projectMode}
          evidenceType={newType}
          onEvidenceTypeChange={setNewType}
          targetValue={newTargetValue}
          targetOptions={targetOptions}
          onTargetChange={setNewTargetValue}
          disabled={readOnly}
          onAssets={persistAssets}
          onError={setError}
        />
      ) : null}

      {items.length ? (
        <View style={styles.gallery}>
          {items.map((item) => {
            const evidenceId = idOf(item);
            const meta = localMeta(item);
            const uri = text(meta.localUri);
            const mediaType = evidenceMediaKind(item);
            const busy = busyId === evidenceId;

            return (
              <View key={evidenceId} style={styles.card}>
                <Pressable
                  disabled={busy}
                  onPress={() => openPreview(item)}
                  style={styles.preview}
                >
                  {uri && mediaType === 'image' ? (
                    <Image
                      source={{ uri }}
                      style={styles.image}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.placeholder}>
                      {busy ? (
                        <ActivityIndicator color={colors.primary} />
                      ) : (
                        <>
                          <Text style={styles.placeholderIcon}>
                            {mediaType === 'video' ? '▶' : '▧'}
                          </Text>
                          <Text style={styles.placeholderText}>
                            {uri
                              ? 'Abrir video'
                              : 'Descargar para ver offline'}
                          </Text>
                        </>
                      )}
                    </View>
                  )}
                </Pressable>

                <View style={styles.body}>
                  <View style={styles.metaRow}>
                    <Text style={styles.type}>
                      {displayType(item, projectMode)}
                    </Text>
                    <Text style={styles.sync}>
                      {syncLabel(meta.syncStatus)}
                    </Text>
                  </View>

                  <Text style={styles.fileName} numberOfLines={1}>
                    {evidenceTitle(item)}
                  </Text>

                  <Text style={styles.note} numberOfLines={2}>
                    {text(item.Nota || item.nota) || 'Sin nota'}
                  </Text>

                  {!readOnly ? (
                    <View style={styles.cardActions}>
                      <Pressable
                        disabled={busy}
                        onPress={() => openEditor(item)}
                        style={styles.smallButton}
                      >
                        <Text style={styles.smallButtonText}>Editar</Text>
                      </Pressable>
                      <Pressable
                        disabled={busy}
                        onPress={() => requestDelete(item)}
                        style={[styles.smallButton, styles.deleteButton]}
                      >
                        <Text style={styles.deleteText}>Eliminar</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Sin evidencias</Text>
          <Text style={styles.muted}>
            {readOnly
              ? 'Este dispositivo no tiene evidencias disponibles.'
              : 'Puede tomar fotos o seleccionar archivos aunque no tenga conexión.'}
          </Text>
        </View>
      )}

      <Modal
        visible={Boolean(editing)}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => !busyId && setEditing(null)}
      >
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Pressable
              disabled={Boolean(busyId)}
              onPress={() => setEditing(null)}
            >
              <Text style={styles.modalCancel}>Cancelar</Text>
            </Pressable>
            <Text style={styles.modalTitle}>Editar evidencia</Text>
            <Pressable
              disabled={Boolean(busyId)}
              onPress={saveEditor}
            >
              <Text style={styles.modalSave}>Guardar</Text>
            </Pressable>
          </View>

          <View style={styles.modalContent}>
            {editing ? (
              <>
                {!projectMode ? (
                  <View>
                    <Text style={styles.fieldLabel}>Tipo de evidencia</Text>
                    <View style={styles.typeChoices}>
                      {['Antes', 'Despues'].map((type) => (
                        <Pressable
                          key={type}
                          disabled={Boolean(busyId)}
                          onPress={() => setEditType(type)}
                          style={[
                            styles.typeChoice,
                            editType === type && styles.typeChoiceSelected,
                          ]}
                        >
                          <Text style={[
                            styles.typeChoiceText,
                            editType === type && styles.typeChoiceTextSelected,
                          ]}>
                            {type === 'Despues' ? 'Después' : type}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ) : (
                  <OptionSheet
                    label="Corresponde a"
                    value={editTargetValue}
                    options={targetOptions}
                    disabled={Boolean(busyId)}
                    onChange={(value) => setEditTargetValue(String(value))}
                  />
                )}

                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Nota</Text>
                  <TextInput
                    value={editNote}
                    onChangeText={setEditNote}
                    editable={!busyId}
                    multiline
                    placeholder="Descripción opcional"
                    placeholderTextColor={colors.muted}
                    style={styles.noteInput}
                  />
                </View>

                <Text style={styles.helper}>
                  La fecha/hora de captura original se conserva. Guardar aquí solo cambia metadatos y nunca necesita Internet.
                </Text>

                <Pressable
                  disabled={Boolean(busyId)}
                  onPress={() => editing && requestDelete(editing)}
                  style={styles.modalDelete}
                >
                  <Text style={styles.modalDeleteText}>Eliminar evidencia</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      {preview ? (
        <EvidenceLightbox
          uri={preview.uri}
          mediaType={preview.mediaType}
          title={preview.title}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineSoft,
    gap: spacing.md,
  },
  loading: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  muted: {
    color: colors.muted,
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 17,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headingText: { flex: 1 },
  eyebrow: {
    color: colors.primary,
    fontWeight: '900',
    fontSize: 10,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.text,
    fontWeight: '900',
    fontSize: 18,
    marginTop: 2,
  },
  count: {
    minWidth: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { color: colors.primary, fontWeight: '900' },
  errorBox: {
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.dangerSoft,
  },
  errorText: { color: colors.danger, fontWeight: '700', fontSize: 11 },
  addPanel: {
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceLow,
    gap: spacing.sm,
  },
  typeChoices: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  typeChoice: {
    flex: 1,
    minHeight: sizing.touchTargetMin,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    backgroundColor: colors.surfaceCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeChoiceSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  typeChoiceText: {
    color: colors.muted,
    fontWeight: '900',
    fontSize: 11,
  },
  typeChoiceTextSelected: { color: '#fff' },
  pickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  pickerButton: {
    minWidth: '47%',
    flexGrow: 1,
    flexBasis: '47%',
    minHeight: 64,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  pickerIcon: { fontSize: 18 },
  pickerLabel: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 11,
    textAlign: 'center',
  },
  helper: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 15,
  },
  gallery: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  card: {
    flexBasis: '47%',
    flexGrow: 1,
    minWidth: 142,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceLow,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineSoft,
  },
  preview: {
    width: '100%',
    aspectRatio: 4 / 3,
    backgroundColor: colors.surfaceHigh,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
  },
  placeholderIcon: { color: colors.primary, fontSize: 28 },
  placeholderText: {
    color: colors.muted,
    fontWeight: '700',
    fontSize: 10,
    textAlign: 'center',
  },
  body: { padding: spacing.sm, gap: 4 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  type: {
    flex: 1,
    color: colors.primary,
    fontWeight: '900',
    fontSize: 10,
  },
  sync: {
    color: colors.muted,
    fontWeight: '800',
    fontSize: 9,
  },
  fileName: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 11,
  },
  note: {
    color: colors.muted,
    fontSize: 10,
    minHeight: 28,
  },
  cardActions: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: 2,
  },
  smallButton: {
    flex: 1,
    minHeight: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallButtonText: {
    color: colors.primary,
    fontWeight: '900',
    fontSize: 10,
  },
  deleteButton: { backgroundColor: colors.dangerSoft },
  deleteText: {
    color: colors.danger,
    fontWeight: '900',
    fontSize: 10,
  },
  empty: {
    minHeight: 120,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceLow,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    gap: 4,
  },
  emptyTitle: { color: colors.text, fontWeight: '900' },
  modal: { flex: 1, backgroundColor: colors.surface },
  modalHeader: {
    minHeight: 58,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outlineSoft,
    backgroundColor: colors.surfaceCard,
  },
  modalCancel: {
    width: 70,
    color: colors.muted,
    fontWeight: '800',
  },
  modalTitle: {
    flex: 1,
    color: colors.text,
    textAlign: 'center',
    fontWeight: '900',
    fontSize: 16,
  },
  modalSave: {
    width: 70,
    textAlign: 'right',
    color: colors.primary,
    fontWeight: '900',
  },
  modalContent: {
    padding: spacing.md,
    gap: spacing.md,
  },
  field: { gap: 6 },
  fieldLabel: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 12,
    marginBottom: 6,
  },
  noteInput: {
    minHeight: 120,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    backgroundColor: colors.surfaceCard,
    color: colors.text,
    padding: spacing.sm,
    textAlignVertical: 'top',
  },
  modalDelete: {
    minHeight: sizing.buttonHeight,
    borderRadius: radius.sm,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalDeleteText: {
    color: colors.danger,
    fontWeight: '900',
  },
  pressed: { opacity: 0.72 },
});

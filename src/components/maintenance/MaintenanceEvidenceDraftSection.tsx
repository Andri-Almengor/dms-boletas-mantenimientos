import { OptionSheet } from '@/components/forms/OptionSheet';
import { MaintenanceEvidencePickerControls } from '@/components/maintenance/MaintenanceEvidencePickerControls';
import {
  evidenceMediaKind,
  projectEvidenceTargets,
} from '@/features/maintenance/maintenanceEvidence';
import { isProjectMaintenance } from '@/features/maintenance/maintenanceProject';
import {
  persistPickedEvidenceAsset,
  removeLocalEvidenceFile,
} from '@/services/maintenanceEvidenceStorage';
import { colors, radius, spacing } from '@/theme/tokens';
import { createLocalId } from '@/utils/localId';
import * as ImagePicker from 'expo-image-picker';
import React, {
  useCallback,
  useMemo,
  useState,
} from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type RecordLike = Record<string, unknown>;

export type DraftMaintenanceEvidence = {
  evidenceId: string;
  localFileId: string;
  localUri: string;
  asset: ImagePicker.ImagePickerAsset;
  fileName: string;
  mimeType: string;
  size: number;
  mediaType: 'image' | 'video';
  durationSeconds: number;
  type: string;
  note: string;
  capturedAt: string;
  targetValue: string;
};

type Props = {
  maintenanceType: unknown;
  device: RecordLike;
  items: DraftMaintenanceEvidence[];
  onChange: (items: DraftMaintenanceEvidence[]) => void;
  disabled?: boolean;
};

export function MaintenanceEvidenceDraftSection({
  maintenanceType,
  device,
  items,
  onChange,
  disabled = false,
}: Props) {
  const [error, setError] = useState('');
  const [newType, setNewType] = useState('Antes');
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
  const [newTargetValue, setNewTargetValue] = useState('DISPOSITIVO');

  const addAssets = useCallback(async (
    assets: ImagePicker.ImagePickerAsset[],
  ) => {
    if (!assets.length || disabled) return;
    setError('');
    const next = [...items];
    const failures: string[] = [];

    for (const asset of assets) {
      const evidenceId = createLocalId('evidencia');
      try {
        const stored = await persistPickedEvidenceAsset({
          evidenceId,
          asset,
        });
        const persistedAsset: ImagePicker.ImagePickerAsset = {
          ...asset,
          uri: stored.localUri,
          fileName: stored.metadata.fileName,
          fileSize: stored.metadata.size,
          mimeType: stored.metadata.mimeType,
        };
        next.push({
          evidenceId,
          localFileId: stored.localFileId,
          localUri: stored.localUri,
          asset: persistedAsset,
          fileName: stored.metadata.fileName,
          mimeType: stored.metadata.mimeType,
          size: stored.metadata.size,
          mediaType: stored.metadata.mediaType === 'video' ? 'video' : 'image',
          durationSeconds: stored.metadata.durationSeconds,
          type: newType,
          note: '',
          capturedAt: new Date().toISOString(),
          targetValue: projectMode
            ? (
                targets.find((target) => target.value === newTargetValue)?.value
                || targets[0]?.value
                || 'DISPOSITIVO'
              )
            : 'DISPOSITIVO',
        });
      } catch (assetError) {
        failures.push(
          assetError instanceof Error
            ? assetError.message
            : 'No se pudo preparar una evidencia.',
        );
      }
    }

    onChange(next);
    if (failures.length) setError(failures[0]);
  }, [
    disabled,
    items,
    newTargetValue,
    newType,
    onChange,
    projectMode,
    targets,
  ]);

  async function remove(item: DraftMaintenanceEvidence) {
    await removeLocalEvidenceFile(item.localUri);
    onChange(items.filter((candidate) => candidate.evidenceId !== item.evidenceId));
  }

  function patch(
    evidenceId: string,
    values: Partial<DraftMaintenanceEvidence>,
  ) {
    onChange(items.map((item) => (
      item.evidenceId === evidenceId
        ? { ...item, ...values }
        : item
    )));
  }

  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <View style={styles.headingText}>
          <Text style={styles.title}>
            {projectMode ? 'Evidencias del proyecto' : 'Evidencias del dispositivo'}
          </Text>
          <Text style={styles.subtitle}>
            Agréguelas ahora. Se guardarán junto con el dispositivo en SQLite.
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

      <MaintenanceEvidencePickerControls
        projectMode={projectMode}
        evidenceType={newType}
        onEvidenceTypeChange={setNewType}
        targetValue={newTargetValue}
        targetOptions={targetOptions}
        onTargetChange={setNewTargetValue}
        disabled={disabled}
        onAssets={addAssets}
        onError={setError}
      />

      {items.length ? (
        <View style={styles.gallery}>
          {items.map((item) => {
            const mediaType = evidenceMediaKind({
              mediaType: item.mediaType,
              MimeType: item.mimeType,
            });
            return (
              <View key={item.evidenceId} style={styles.card}>
                <View style={styles.preview}>
                  {mediaType === 'image' ? (
                    <Image
                      source={{ uri: item.localUri }}
                      style={styles.image}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.videoPlaceholder}>
                      <Text style={styles.videoIcon}>▶</Text>
                      <Text style={styles.videoText}>
                        Video · {Math.ceil(item.durationSeconds || 0)} s
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.cardBody}>
                  <Text style={styles.fileName} numberOfLines={1}>
                    {item.fileName}
                  </Text>

                  {!projectMode ? (
                    <View style={styles.typeChoices}>
                      {['Antes', 'Despues'].map((type) => (
                        <Pressable
                          key={type}
                          disabled={disabled}
                          onPress={() => patch(item.evidenceId, { type })}
                          style={[
                            styles.typeChoice,
                            item.type === type && styles.typeChoiceSelected,
                          ]}
                        >
                          <Text style={[
                            styles.typeChoiceText,
                            item.type === type && styles.typeChoiceTextSelected,
                          ]}>
                            {type === 'Despues' ? 'Después' : type}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : (
                    <OptionSheet
                      label="Corresponde a"
                      value={item.targetValue}
                      options={targetOptions}
                      disabled={disabled}
                      onChange={(value) => patch(
                        item.evidenceId,
                        { targetValue: String(value) },
                      )}
                    />
                  )}

                  <TextInput
                    editable={!disabled}
                    value={item.note}
                    onChangeText={(note) => patch(item.evidenceId, { note })}
                    placeholder="Nota opcional"
                    placeholderTextColor={colors.muted}
                    style={styles.note}
                  />

                  <Pressable
                    disabled={disabled}
                    onPress={() => remove(item)}
                    style={styles.removeButton}
                  >
                    <Text style={styles.removeText}>Quitar evidencia</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Sin evidencias todavía</Text>
          <Text style={styles.emptyText}>
            Puede tomar fotos o videos ahora; no necesita guardar primero el dispositivo.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineSoft,
    gap: spacing.md,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headingText: { flex: 1 },
  title: { color: colors.text, fontWeight: '900', fontSize: 17 },
  subtitle: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
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
  gallery: { gap: spacing.sm },
  card: {
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceLow,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineSoft,
  },
  preview: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: colors.surfaceHigh,
  },
  image: { width: '100%', height: '100%' },
  videoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  videoIcon: { color: colors.primary, fontSize: 28 },
  videoText: { color: colors.muted, fontWeight: '700', fontSize: 11 },
  cardBody: { padding: spacing.sm, gap: spacing.xs },
  fileName: { color: colors.text, fontWeight: '800', fontSize: 11 },
  typeChoices: { flexDirection: 'row', gap: spacing.xs },
  typeChoice: {
    flex: 1,
    minHeight: 38,
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
  typeChoiceText: { color: colors.muted, fontWeight: '800', fontSize: 10 },
  typeChoiceTextSelected: { color: '#fff' },
  note: {
    minHeight: 42,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    backgroundColor: colors.surfaceCard,
    color: colors.text,
    paddingHorizontal: spacing.sm,
  },
  removeButton: {
    minHeight: 38,
    borderRadius: radius.sm,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: { color: colors.danger, fontWeight: '900', fontSize: 10 },
  empty: {
    minHeight: 86,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceLow,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    gap: 4,
  },
  emptyTitle: { color: colors.text, fontWeight: '900' },
  emptyText: {
    color: colors.muted,
    textAlign: 'center',
    fontSize: 10,
    lineHeight: 15,
  },
});

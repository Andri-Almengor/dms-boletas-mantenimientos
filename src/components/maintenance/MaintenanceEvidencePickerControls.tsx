import { OptionItem, OptionSheet } from '@/components/forms/OptionSheet';
import { colors, radius, sizing, spacing } from '@/theme/tokens';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type Props = {
  projectMode: boolean;
  evidenceType: string;
  onEvidenceTypeChange: (value: string) => void;
  targetValue?: string;
  targetOptions?: OptionItem[];
  onTargetChange?: (value: string) => void;
  disabled?: boolean;
  onAssets: (assets: ImagePicker.ImagePickerAsset[]) => void | Promise<void>;
  onError: (message: string) => void;
};

export function MaintenanceEvidencePickerControls({
  projectMode,
  evidenceType,
  onEvidenceTypeChange,
  targetValue = 'DISPOSITIVO',
  targetOptions = [],
  onTargetChange,
  disabled = false,
  onAssets,
  onError,
}: Props) {
  // Mantener callbacks actuales sin volver a consumir getPendingResultAsync
  // cuando cambia una nota, destino o estado React del formulario.
  const assetsRef = useRef(onAssets);
  const errorRef = useRef(onError);
  assetsRef.current = onAssets;
  errorRef.current = onError;
  const consumedUrisRef = useRef(new Set<string>());
  const launchInProgressRef = useRef(false);
  const [processing, setProcessing] = useState(false);
  const pickerDisabled = disabled || processing;

  const consumeAssets = useCallback(async (assets: ImagePicker.ImagePickerAsset[]) => {
    const unique = assets.filter((asset) => {
      const uri = String(asset.uri || '').trim();
      if (!uri || consumedUrisRef.current.has(uri)) return false;
      consumedUrisRef.current.add(uri);
      return true;
    });
    if (!unique.length) return;
    await assetsRef.current(unique);
  }, []);

  useEffect(() => {
    if (disabled) return;
    let active = true;

    ImagePicker.getPendingResultAsync()
      .then(async (result) => {
        if (!active || !result || !('canceled' in result)
          || result.canceled || !Array.isArray(result.assets)) return;
        await consumeAssets(result.assets);
      })
      .catch((error) => {
        if (active) errorRef.current(
          error instanceof Error ? error.message : 'No se pudo recuperar la captura pendiente.',
        );
      });

    return () => { active = false; };
  }, [disabled, consumeAssets]);

  async function launch(
    permission: () => Promise<boolean>,
    picker: () => Promise<ImagePicker.ImagePickerResult>,
  ) {
    if (disabled || launchInProgressRef.current) return;
    launchInProgressRef.current = true;
    setProcessing(true);
    try {
      if (!await permission()) return;
      errorRef.current('');
      const result = await picker();
      if (!result.canceled) await consumeAssets(result.assets);
    } catch (error) {
      errorRef.current(error instanceof Error
        ? error.message : 'No se pudo guardar la evidencia tomada.');
    } finally {
      launchInProgressRef.current = false;
      setProcessing(false);
    }
  }

  async function requireCameraPermission() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      onError('Se necesita permiso de cámara para tomar evidencias.');
      return false;
    }
    return true;
  }

  async function requireLibraryPermission() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      onError('Se necesita permiso para seleccionar evidencias de la galería.');
      return false;
    }
    return true;
  }

  async function takePhoto() {
    await launch(requireCameraPermission, () => ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      cameraType: ImagePicker.CameraType.back,
      allowsEditing: true,
      quality: 0.9,
    }));
  }

  async function recordVideo() {
    await launch(requireCameraPermission, () => ImagePicker.launchCameraAsync({
      mediaTypes: ['videos'],
      cameraType: ImagePicker.CameraType.back,
      allowsEditing: false,
      videoMaxDuration: 90,
      quality: 1,
    }));
  }

  async function pickEditablePhoto() {
    await launch(requireLibraryPermission, () => ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.9,
    }));
  }

  async function pickMultiple() {
    await launch(requireLibraryPermission, () => ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      selectionLimit: 30,
      orderedSelection: true,
      quality: 1,
    }));
  }

  return (
    <View style={styles.panel}>
      {!projectMode ? (
        <View style={styles.typeChoices}>
          {['Antes', 'Despues'].map((type) => (
            <Pressable
              key={type}
              disabled={pickerDisabled}
              onPress={() => onEvidenceTypeChange(type)}
              style={[
                styles.typeChoice,
                evidenceType === type && styles.typeChoiceSelected,
                pickerDisabled && styles.disabled,
              ]}
            >
              <Text style={[
                styles.typeChoiceText,
                evidenceType === type && styles.typeChoiceTextSelected,
              ]}>
                {type === 'Despues' ? 'Después' : type}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <OptionSheet
          label="Corresponde a"
          value={targetValue}
          options={targetOptions}
          disabled={pickerDisabled}
          onChange={(value) => onTargetChange?.(String(value))}
        />
      )}

      <View style={styles.primaryPickerRow}>
        <PickerButton
          label="Tomar foto"
          icon="▣"
          primary
          disabled={pickerDisabled}
          onPress={takePhoto}
        />
        <PickerButton
          label="Foto galería"
          icon="▧"
          disabled={pickerDisabled}
          onPress={pickEditablePhoto}
        />
      </View>

      <View style={styles.secondaryPickerRow}>
        <Pressable
          disabled={pickerDisabled}
          onPress={pickMultiple}
          style={({ pressed }) => [
            styles.secondaryAction,
            pickerDisabled && styles.disabled,
            pressed && !pickerDisabled && styles.pressed,
          ]}
        >
          <Text style={styles.secondaryActionText}>▦ Seleccionar varios</Text>
        </Pressable>
        <Pressable
          disabled={pickerDisabled}
          onPress={recordVideo}
          style={({ pressed }) => [
            styles.secondaryAction,
            pickerDisabled && styles.disabled,
            pressed && !pickerDisabled && styles.pressed,
          ]}
        >
          <Text style={styles.secondaryActionText}>▶ Grabar video</Text>
        </Pressable>
      </View>

      <Text style={styles.helper}>
        Los archivos se guardan primero en el teléfono y se sincronizan después.
      </Text>
    </View>
  );
}

function PickerButton({
  label,
  icon,
  primary = false,
  disabled,
  onPress,
}: {
  label: string;
  icon: string;
  primary?: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pickerButton,
        primary && styles.pickerButtonPrimary,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[
        styles.pickerIcon,
        primary && styles.pickerIconPrimary,
      ]}>
        {icon}
      </Text>
      <Text style={[
        styles.pickerLabel,
        primary && styles.pickerLabelPrimary,
      ]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: {
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
  primaryPickerRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  pickerButton: {
    flex: 1,
    minHeight: 58,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  pickerButtonPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pickerIcon: {
    color: colors.primary,
    fontSize: 17,
    fontWeight: '900',
  },
  pickerIconPrimary: {
    color: '#ffffff',
  },
  pickerLabel: {
    color: colors.text,
    fontWeight: '900',
    fontSize: 12,
    textAlign: 'center',
  },
  pickerLabelPrimary: {
    color: '#ffffff',
  },
  secondaryPickerRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  secondaryAction: {
    flex: 1,
    minHeight: sizing.touchTargetMin,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionText: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '800',
    textAlign: 'center',
  },
  helper: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 15,
  },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.72 },
});

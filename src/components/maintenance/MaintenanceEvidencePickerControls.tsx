import { OptionItem, OptionSheet } from '@/components/forms/OptionSheet';
import { colors, radius, sizing, spacing } from '@/theme/tokens';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect } from 'react';
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
  useEffect(() => {
    if (disabled) return;
    let active = true;

    ImagePicker.getPendingResultAsync()
      .then((result) => {
        if (
          !active
          || !result
          || !('canceled' in result)
          || result.canceled
          || !Array.isArray(result.assets)
        ) {
          return;
        }
        return onAssets(result.assets);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [disabled, onAssets]);

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
    if (disabled || !await requireCameraPermission()) return;
    onError('');
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      cameraType: ImagePicker.CameraType.back,
      allowsEditing: true,
      quality: 0.9,
    });
    if (!result.canceled) await onAssets(result.assets);
  }

  async function recordVideo() {
    if (disabled || !await requireCameraPermission()) return;
    onError('');
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['videos'],
      cameraType: ImagePicker.CameraType.back,
      allowsEditing: false,
      videoMaxDuration: 90,
      quality: 1,
    });
    if (!result.canceled) await onAssets(result.assets);
  }

  async function pickEditablePhoto() {
    if (disabled || !await requireLibraryPermission()) return;
    onError('');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.9,
    });
    if (!result.canceled) await onAssets(result.assets);
  }

  async function pickMultiple() {
    if (disabled || !await requireLibraryPermission()) return;
    onError('');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      selectionLimit: 30,
      orderedSelection: true,
      quality: 1,
    });
    if (!result.canceled) await onAssets(result.assets);
  }

  return (
    <View style={styles.panel}>
      {!projectMode ? (
        <View style={styles.typeChoices}>
          {['Antes', 'Despues'].map((type) => (
            <Pressable
              key={type}
              disabled={disabled}
              onPress={() => onEvidenceTypeChange(type)}
              style={[
                styles.typeChoice,
                evidenceType === type && styles.typeChoiceSelected,
                disabled && styles.disabled,
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
          disabled={disabled}
          onChange={(value) => onTargetChange?.(String(value))}
        />
      )}

      <View style={styles.pickerGrid}>
        <PickerButton
          label="Tomar foto"
          icon="📷"
          disabled={disabled}
          onPress={takePhoto}
        />
        <PickerButton
          label="Foto galería"
          icon="🖼"
          disabled={disabled}
          onPress={pickEditablePhoto}
        />
        <PickerButton
          label="Seleccionar varios"
          icon="▦"
          disabled={disabled}
          onPress={pickMultiple}
        />
        <PickerButton
          label="Grabar video"
          icon="▶"
          disabled={disabled}
          onPress={recordVideo}
        />
      </View>

      <Text style={styles.helper}>
        Las fotos individuales permiten recortar o rotar. Fotos y videos se guardan primero en el teléfono y se sincronizan después.
      </Text>
    </View>
  );
}

function PickerButton({
  label,
  icon,
  disabled,
  onPress,
}: {
  label: string;
  icon: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pickerButton,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={styles.pickerIcon}>{icon}</Text>
      <Text style={styles.pickerLabel}>{label}</Text>
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
  pickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  pickerButton: {
    minWidth: '47%',
    flexGrow: 1,
    flexBasis: '47%',
    minHeight: 62,
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
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.72 },
});

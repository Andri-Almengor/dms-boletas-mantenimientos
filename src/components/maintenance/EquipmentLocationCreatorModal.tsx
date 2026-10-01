import { OptionItem, OptionSheet } from '@/components/forms/OptionSheet';
import { colors, radius, sizing, spacing } from '@/theme/tokens';
import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

export type EquipmentLocationCreatorValue = {
  parentLocationId: string;
  name: string;
  description: string;
};

type Props = {
  visible: boolean;
  parentOptions: OptionItem[];
  initialParentId?: string;
  saving?: boolean;
  onClose: () => void;
  onSubmit: (value: EquipmentLocationCreatorValue) => void | Promise<void>;
};

export function EquipmentLocationCreatorModal({
  visible,
  parentOptions,
  initialParentId = '',
  saving = false,
  onClose,
  onSubmit,
}: Props) {
  const [parentLocationId, setParentLocationId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setParentLocationId(
      String(initialParentId || parentOptions[0]?.value || ''),
    );
    setName('');
    setDescription('');
    setError('');
  }, [visible, initialParentId, parentOptions]);

  async function submit() {
    const parentId = String(parentLocationId || '').trim();
    const locationName = String(name || '').trim();

    if (!parentId) {
      setError('Seleccione la ubicación principal.');
      return;
    }
    if (!locationName) {
      setError('Escriba el nombre de la ubicación del equipo.');
      return;
    }

    setError('');
    await onSubmit({
      parentLocationId: parentId,
      name: locationName,
      description: String(description || '').trim(),
    });
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={saving ? undefined : onClose}
    >
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable
            disabled={saving}
            onPress={onClose}
            style={styles.headerAction}
          >
            <Text style={styles.cancelText}>Cancelar</Text>
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>Ubicación del equipo</Text>
            <Text style={styles.title}>Nueva ubicación</Text>
          </View>
          <Pressable
            disabled={saving}
            onPress={submit}
            style={styles.headerAction}
          >
            <Text style={styles.saveText}>{saving ? 'Guardando…' : 'Agregar'}</Text>
          </Pressable>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          <View style={styles.info}>
            <Text style={styles.infoIcon}>⌖</Text>
            <Text style={styles.infoText}>
              Seleccione la sede y asigne un nombre corto que el técnico pueda reconocer rápidamente.
            </Text>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <OptionSheet
            label="Ubicación principal *"
            value={parentLocationId}
            options={parentOptions}
            disabled={saving}
            placeholder="Seleccione una ubicación"
            onChange={(value) => setParentLocationId(String(value))}
          />

          <View style={styles.field}>
            <Text style={styles.label}>Nombre *</Text>
            <TextInput
              editable={!saving}
              value={name}
              onChangeText={setName}
              placeholder="Ej. Oficina 1, Rack principal, Piso 2"
              placeholderTextColor={colors.muted}
              returnKeyType="next"
              style={styles.input}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Descripción</Text>
            <TextInput
              editable={!saving}
              value={description}
              onChangeText={setDescription}
              placeholder="Detalle opcional"
              placeholderTextColor={colors.muted}
              multiline
              textAlignVertical="top"
              style={[styles.input, styles.textarea]}
            />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  header: {
    minHeight: 70,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outlineSoft,
    backgroundColor: colors.surfaceCard,
  },
  headerAction: {
    width: 82,
    minHeight: sizing.touchTargetMin,
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
    alignItems: 'center',
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
    marginTop: 2,
  },
  cancelText: {
    color: colors.muted,
    fontWeight: '800',
  },
  saveText: {
    color: colors.primary,
    textAlign: 'right',
    fontWeight: '900',
  },
  content: {
    padding: spacing.md,
    gap: spacing.md,
  },
  info: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  infoIcon: {
    color: colors.primary,
    fontSize: 22,
    fontWeight: '900',
  },
  infoText: {
    flex: 1,
    color: colors.variant,
    fontSize: 12,
    lineHeight: 18,
  },
  errorBox: {
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.dangerSoft,
  },
  errorText: {
    color: colors.danger,
    fontWeight: '800',
    fontSize: 12,
  },
  field: {
    gap: 7,
  },
  label: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  input: {
    minHeight: sizing.controlHeight,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: colors.surfaceCard,
    color: colors.text,
  },
  textarea: {
    minHeight: 110,
    paddingTop: spacing.sm,
  },
});

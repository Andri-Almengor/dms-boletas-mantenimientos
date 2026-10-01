import {
  PROJECT_CHECKLIST_RESPONSE_TYPES,
  projectChecklistProgressForDevice,
  setProjectProgressAnswer,
} from '@/features/maintenance/maintenanceProject';
import { DeviceEditorForm } from '@/features/maintenance/maintenanceEditorDomain';
import { colors, radius, spacing } from '@/theme/tokens';
import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Props = {
  checklist: unknown;
  device: DeviceEditorForm;
  disabled?: boolean;
  onChange: (value: DeviceEditorForm['projectProgress']) => void;
};

export function ProjectProgressEditor({
  checklist,
  device,
  disabled = false,
  onChange,
}: Props) {
  const stats = projectChecklistProgressForDevice(
    checklist,
    {
      tipoDispositivoId: device.deviceTypeId,
      categoria: device.category,
      projectProgress: device.projectProgress,
    },
  );

  if (!stats.group || !stats.total) {
    return (
      <View style={styles.info}>
        <Text style={styles.infoTitle}>Progreso del proyecto</Text>
        <Text style={styles.infoText}>
          Este tipo de dispositivo no tiene checklist de progreso configurado.
        </Text>
      </View>
    );
  }

  function setAnswer(
    question: Record<string, unknown>,
    value: string,
    note = '',
  ) {
    onChange(setProjectProgressAnswer(
      device.projectProgress,
      question,
      value,
      note,
    ));
  }

  return (
    <View style={styles.container}>
      <View style={styles.heading}>
        <View style={styles.headingText}>
          <Text style={styles.eyebrow}>Progreso del proyecto</Text>
          <Text style={styles.title}>
            {String(stats.group?.typeName || device.category)}
          </Text>
        </View>
        <Text style={styles.percent}>{stats.percent}%</Text>
      </View>

      <View style={styles.track}>
        <View style={[styles.trackFill, { width: `${stats.percent}%` }]} />
      </View>

      {stats.items.map((question) => {
        const options = question.responseType === PROJECT_CHECKLIST_RESPONSE_TYPES.YES_NO
          ? [['SI', 'Sí'], ['NO', 'No']]
          : [['PENDIENTE', 'Pendiente'], ['REALIZADO', 'Realizado']];

        return (
          <View
            key={String(question.id)}
            style={[
              styles.question,
              question.completed && styles.questionComplete,
            ]}
          >
            <Text style={styles.questionTitle}>{question.label}</Text>
            <View style={styles.choices}>
              {options.map(([answerValue, label]) => (
                <Pressable
                  key={answerValue}
                  disabled={disabled}
                  onPress={() => setAnswer(question, answerValue, question.note)}
                  style={[
                    styles.choice,
                    question.value === answerValue && styles.choiceSelected,
                  ]}
                >
                  <Text style={[
                    styles.choiceText,
                    question.value === answerValue && styles.choiceTextSelected,
                  ]}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
            {question.responseType === PROJECT_CHECKLIST_RESPONSE_TYPES.PROGRESS
              && question.value === 'PENDIENTE' ? (
                <View style={styles.noteField}>
                  <Text style={styles.noteLabel}>Nota del pendiente</Text>
                  <TextInput
                    editable={!disabled}
                    value={question.note || ''}
                    onChangeText={(note) => setAnswer(question, 'PENDIENTE', note)}
                    placeholder="Explique por qué continúa pendiente (opcional)."
                    placeholderTextColor={colors.muted}
                    multiline
                    style={styles.noteInput}
                  />
                </View>
              ) : null}
          </View>
        );
      })}
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
    gap: spacing.sm,
  },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headingText: { flex: 1 },
  eyebrow: {
    color: colors.primary,
    fontWeight: '900',
    textTransform: 'uppercase',
    fontSize: 10,
  },
  title: { color: colors.text, fontWeight: '900', fontSize: 16, marginTop: 2 },
  percent: { color: colors.primary, fontWeight: '900', fontSize: 20 },
  track: {
    height: 7,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: colors.surfaceHigh,
  },
  trackFill: { height: '100%', backgroundColor: colors.primary },
  question: {
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceLow,
    gap: spacing.xs,
  },
  questionComplete: { backgroundColor: colors.successSoft },
  questionTitle: { color: colors.text, fontWeight: '800', lineHeight: 18 },
  choices: { flexDirection: 'row', gap: spacing.xs },
  choice: {
    flex: 1,
    minHeight: 42,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    backgroundColor: colors.surfaceCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  choiceText: { color: colors.muted, fontWeight: '800', fontSize: 11 },
  choiceTextSelected: { color: '#fff' },
  noteField: { gap: 5 },
  noteLabel: { color: colors.text, fontWeight: '800', fontSize: 10 },
  noteInput: {
    minHeight: 78,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    backgroundColor: colors.surfaceCard,
    color: colors.text,
    padding: spacing.sm,
    textAlignVertical: 'top',
  },
  info: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    gap: 4,
  },
  infoTitle: { color: colors.text, fontWeight: '900' },
  infoText: { color: colors.variant, fontSize: 12, lineHeight: 18 },
});

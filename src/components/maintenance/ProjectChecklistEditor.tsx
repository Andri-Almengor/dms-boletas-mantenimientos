import {
  createProjectChecklistQuestion,
  normalizeProjectChecklist,
  PROJECT_CHECKLIST_RESPONSE_TYPES,
  projectChecklistGroupForCategory,
  upsertProjectChecklistGroup,
} from '@/features/maintenance/maintenanceProject';
import {
  MAINTENANCE_CATEGORIES,
} from '@/features/maintenance/maintenanceCategories';
import { colors, radius, sizing, spacing } from '@/theme/tokens';
import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Props = {
  counts: Record<string, number>;
  value: unknown;
  disabled?: boolean;
  onChange: (value: ReturnType<typeof normalizeProjectChecklist>) => void;
};

export function ProjectChecklistEditor({
  counts,
  value,
  disabled = false,
  onChange,
}: Props) {
  const draftOptions = { preserveDraftText: true };
  const schema = normalizeProjectChecklist(value, draftOptions);
  const selected = MAINTENANCE_CATEGORIES.filter(
    (category) => Number(counts[category.countField] || 0) > 0,
  );

  function patchGroup(
    category: typeof MAINTENANCE_CATEGORIES[number],
    updater: (group: Record<string, unknown> & { questions: Record<string, unknown>[] }) => Record<string, unknown> & { questions: Record<string, unknown>[] },
  ) {
    onChange(upsertProjectChecklistGroup(
      schema,
      {
        key: category.key,
        label: category.key,
        countField: category.countField,
      },
      updater,
      draftOptions,
    ));
  }

  if (!selected.length) {
    return (
      <View style={styles.info}>
        <Text style={styles.infoTitle}>Checklist del proyecto</Text>
        <Text style={styles.infoText}>
          Seleccione una cantidad mayor que cero para al menos un tipo de dispositivo.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View>
        <Text style={styles.heading}>Checklist personalizado</Text>
        <Text style={styles.subheading}>
          Estas preguntas pertenecen únicamente a este Proyecto.
        </Text>
      </View>

      {selected.map((category) => {
        const group = projectChecklistGroupForCategory(
          schema,
          {
            key: category.key,
            label: category.key,
            countField: category.countField,
          },
          draftOptions,
        ) || { questions: [] };

        return (
          <View key={category.countField} style={styles.group}>
            <View style={styles.groupHeader}>
              <View style={styles.groupText}>
                <Text style={styles.groupTitle}>{category.key}</Text>
                <Text style={styles.groupNote}>
                  {group.questions.length} pregunta{group.questions.length === 1 ? '' : 's'}
                </Text>
              </View>
              {!disabled ? (
                <Pressable
                  onPress={() => patchGroup(category, (current) => ({
                    ...current,
                    questions: [
                      ...(current.questions || []),
                      createProjectChecklistQuestion(),
                    ],
                  }))}
                  style={styles.addButton}
                >
                  <Text style={styles.addButtonText}>+ Pregunta</Text>
                </Pressable>
              ) : null}
            </View>

            {!group.questions.length ? (
              <Text style={styles.empty}>Sin checklist personalizado.</Text>
            ) : null}

            {group.questions.map((question, index) => (
              <View key={String(question.id)} style={styles.question}>
                <View style={styles.questionNumber}>
                  <Text style={styles.questionNumberText}>{index + 1}</Text>
                </View>
                <View style={styles.questionBody}>
                  <Text style={styles.label}>Pregunta</Text>
                  <TextInput
                    editable={!disabled}
                    value={String(question.label || '')}
                    onChangeText={(label) => patchGroup(category, (current) => ({
                      ...current,
                      questions: (current.questions || []).map((item) => (
                        item.id === question.id ? { ...item, label } : item
                      )),
                    }))}
                    placeholder="Ej. ¿Lector instalado?"
                    placeholderTextColor={colors.muted}
                    style={styles.input}
                  />
                  <Text style={styles.label}>Respuesta</Text>
                  <View style={styles.choiceRow}>
                    {[
                      [PROJECT_CHECKLIST_RESPONSE_TYPES.PROGRESS, 'Pendiente / Realizado'],
                      [PROJECT_CHECKLIST_RESPONSE_TYPES.YES_NO, 'Sí / No'],
                    ].map(([type, label]) => (
                      <Pressable
                        key={type}
                        disabled={disabled}
                        onPress={() => patchGroup(category, (current) => ({
                          ...current,
                          questions: (current.questions || []).map((item) => (
                            item.id === question.id
                              ? { ...item, responseType: type }
                              : item
                          )),
                        }))}
                        style={[
                          styles.choice,
                          question.responseType === type && styles.choiceSelected,
                        ]}
                      >
                        <Text style={[
                          styles.choiceText,
                          question.responseType === type && styles.choiceTextSelected,
                        ]}>
                          {label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                {!disabled ? (
                  <Pressable
                    onPress={() => patchGroup(category, (current) => ({
                      ...current,
                      questions: (current.questions || []).filter(
                        (item) => item.id !== question.id,
                      ),
                    }))}
                    style={styles.deleteButton}
                  >
                    <Text style={styles.deleteText}>×</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  heading: { color: colors.text, fontWeight: '900', fontSize: 17 },
  subheading: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 3 },
  info: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    gap: 4,
  },
  infoTitle: { color: colors.text, fontWeight: '900' },
  infoText: { color: colors.variant, fontSize: 12, lineHeight: 18 },
  group: {
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineSoft,
    gap: spacing.sm,
  },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  groupText: { flex: 1 },
  groupTitle: { color: colors.text, fontWeight: '900', fontSize: 15 },
  groupNote: { color: colors.muted, fontSize: 10, marginTop: 2 },
  addButton: {
    minHeight: 38,
    paddingHorizontal: spacing.sm,
    borderRadius: 999,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: { color: colors.primary, fontWeight: '900', fontSize: 11 },
  empty: { color: colors.muted, fontSize: 12 },
  question: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'flex-start',
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.outlineSoft,
  },
  questionNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 19,
  },
  questionNumberText: { color: colors.primary, fontWeight: '900', fontSize: 11 },
  questionBody: { flex: 1, gap: 5 },
  label: { color: colors.text, fontWeight: '800', fontSize: 10 },
  input: {
    minHeight: sizing.controlHeight,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: spacing.sm,
  },
  choiceRow: { gap: 5 },
  choice: {
    minHeight: 40,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    justifyContent: 'center',
  },
  choiceSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  choiceText: { color: colors.muted, fontWeight: '800', fontSize: 11 },
  choiceTextSelected: { color: '#fff' },
  deleteButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 19,
  },
  deleteText: { color: colors.danger, fontWeight: '900', fontSize: 20 },
});

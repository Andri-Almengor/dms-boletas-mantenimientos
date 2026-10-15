import {
  normalizeProjectRelationValue,
  projectChecklistProgressForDevice,
} from '@/features/maintenance/maintenanceProject';
import {
  MaintenanceQuestion,
  deviceSavedAnswers,
  questionsForDevice,
} from '@/features/maintenance/maintenanceQuestions';
import {
  projectEvidenceTargetValue,
} from '@/features/maintenance/maintenanceEvidence';
import { colors, radius, spacing } from '@/theme/tokens';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type RecordLike = Record<string, unknown>;
type Props = {
  device: RecordLike;
  projectChecklist: unknown;
  questions: MaintenanceQuestion[];
  evidence: RecordLike[];
};

function display(value: unknown, fallback = 'Sin responder'): string {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return fallback;
  return String(value).trim() || fallback;
}

function field(value: unknown): string {
  return display(value, 'Sin registrar');
}

function AnswerRow({ label, answer, historical = false }: {
  label: string;
  answer: unknown;
  historical?: boolean;
}) {
  return (
    <View style={styles.answerRow}>
      <Text style={styles.answerLabel}>
        {label}{historical ? ' · Histórica' : ''}
      </Text>
      <Text style={styles.answerValue}>{display(answer)}</Text>
    </View>
  );
}

function RelatedComponent({
  item,
  index,
  relatedTypeName,
  relatedQuestions,
  evidenceCount,
}: {
  item: RecordLike;
  index: number;
  relatedTypeName: string;
  relatedQuestions: MaintenanceQuestion[];
  evidenceCount: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const answers = deviceSavedAnswers(item);
  const name = field(item.nombre || item.NombreDispositivo);
  return (
    <View style={styles.component}>
      <Pressable
        onPress={() => setExpanded(!expanded)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={styles.componentHeader}
      >
        <View style={styles.grow}>
          <Text style={styles.componentName}>
            {relatedTypeName} {index + 1} · {name}
          </Text>
          <Text style={styles.subtle}>
            {evidenceCount} evidencia{evidenceCount === 1 ? '' : 's'} asignada{evidenceCount === 1 ? '' : 's'}
          </Text>
        </View>
        <Text style={styles.chevron}>{expanded ? '⌃' : '⌄'}</Text>
      </Pressable>

      {expanded ? (
        <View style={styles.componentFields}>
          <AnswerRow label="Fabricante" answer={field(item.fabricante || item.Fabricante)} />
          <AnswerRow label="Modelo" answer={field(item.modelo || item.Modelo)} />
          <AnswerRow label="Número de serie" answer={field(item.serie || item.Serie)} />
          <AnswerRow label="Dirección MAC" answer={field(item.macAddress || item.DireccionMAC)} />
          {relatedQuestions.map((question) => (
            <AnswerRow
              key={question.questionId || question.key}
              label={question.label}
              historical={question.historical}
              answer={answers[question.key] ?? question.value}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Vista de consulta. Reutiliza los normalizadores del editor y el checklist
 * guardados en SQLite; nunca envía mutaciones o consulta al backend.
 */
export function ProjectDeviceSections({
  device,
  projectChecklist,
  questions,
  evidence,
}: Props) {
  const [answersOpen, setAnswersOpen] = useState(true);
  const [checklistOpen, setChecklistOpen] = useState(true);

  const projectQuestions = useMemo(
    () => questionsForDevice(questions, device, 'PROYECTO'),
    [questions, device],
  );
  const answers = useMemo(
    () => deviceSavedAnswers(device),
    [device],
  );
  const progress = useMemo(
    () => projectChecklistProgressForDevice(projectChecklist, device),
    [projectChecklist, device],
  );
  const evidenceByTarget = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of evidence) {
      const target = projectEvidenceTargetValue(item);
      map.set(target, (map.get(target) || 0) + 1);
    }
    return map;
  }, [evidence]);

  return (
    <View style={styles.outer}>
      <View style={styles.section}>
        <Pressable
          style={styles.heading}
          onPress={() => setAnswersOpen((open) => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded: answersOpen }}
        >
          <View style={styles.grow}>
            <Text style={styles.sectionTitle}>Campos y relaciones del proyecto</Text>
            <Text style={styles.subtle}>
              {projectQuestions.length} campo{projectQuestions.length === 1 ? '' : 's'} configurado{projectQuestions.length === 1 ? '' : 's'}
            </Text>
          </View>
          <Text style={styles.chevron}>{answersOpen ? '⌃' : '⌄'}</Text>
        </Pressable>

        {answersOpen ? projectQuestions.length ? projectQuestions.map((question) => {
          if (question.responseType !== 'RELACION_DISPOSITIVO') {
            return (
              <AnswerRow
                key={question.questionId || question.key}
                label={question.label}
                historical={question.historical}
                answer={answers[question.key] ?? question.value}
              />
            );
          }

          const relation = normalizeProjectRelationValue(
            answers[question.key] ?? question.value,
            { relatedTypeId: question.relatedTypeId },
          );
          const relatedTypeName = relation.relatedTypeName
            || relation.items[0]?.categoria
            || 'Componente';
          return (
            <View key={question.questionId || question.key} style={styles.relation}>
              <Text style={styles.relationTitle}>
                {question.label}{question.historical ? ' · Histórica' : ''}
              </Text>
              <Text style={styles.relationMeta}>
                {relation.enabled
                  ? `Sí · ${relation.items.length} relacionado${relation.items.length === 1 ? '' : 's'}`
                  : 'No'}
              </Text>
              {relation.enabled ? relation.items.map((item, index) => {
                const relatedQuestions = questionsForDevice(
                  questions,
                  item,
                  'PROYECTO',
                ).filter((q) => q.responseType !== 'RELACION_DISPOSITIVO');
                const target = `COMPONENTE:${question.key}:${String(item.localId || '')}`;
                return (
                  <RelatedComponent
                    key={String(item.localId || index)}
                    item={item}
                    index={index}
                    relatedTypeName={String(relatedTypeName)}
                    relatedQuestions={relatedQuestions}
                    evidenceCount={evidenceByTarget.get(target) || 0}
                  />
                );
              }) : null}
            </View>
          );
        }) : (
          <Text style={styles.subtle}>
            No hay campos guardados o disponibles en el catálogo offline para este tipo.
          </Text>
        ) : null}
      </View>

      <View style={styles.section}>
        <Pressable
          style={styles.heading}
          onPress={() => setChecklistOpen((open) => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded: checklistOpen }}
        >
          <View style={styles.grow}>
            <Text style={styles.sectionTitle}>Checklist de progreso</Text>
            <Text style={styles.subtle}>
              {progress.completed} de {progress.total} completadas · {progress.percent}%
            </Text>
          </View>
          <Text style={styles.chevron}>{checklistOpen ? '⌃' : '⌄'}</Text>
        </Pressable>

        {checklistOpen ? progress.items.length ? progress.items.map((question) => (
          <View key={String(question.id)} style={styles.checklistItem}>
            <Text style={styles.answerLabel}>{question.label}</Text>
            <Text style={[
              styles.answerValue,
              question.completed ? styles.done : styles.pending,
            ]}>
              {question.value === 'SI' ? 'Sí'
                : question.value === 'NO' ? 'No'
                : question.value === 'REALIZADO' ? 'Realizado'
                : 'Pendiente'}
            </Text>
            {question.note ? (
              <Text style={styles.pendingNote}>Nota: {question.note}</Text>
            ) : null}
          </View>
        )) : (
          <Text style={styles.subtle}>
            Sin checklist de progreso configurado para este tipo de dispositivo.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { gap: spacing.md },
  section: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    gap: spacing.sm,
  },
  heading: {
    flexDirection: 'row', alignItems: 'center',
    gap: spacing.sm, minHeight: 42,
  },
  grow: { flex: 1 },
  sectionTitle: { color: colors.text, fontWeight: '900', fontSize: 16 },
  subtle: { color: colors.muted, fontSize: 12, marginTop: 3, lineHeight: 17 },
  chevron: { color: colors.primary, fontSize: 20, fontWeight: '900' },
  answerRow: { gap: 5, paddingVertical: 7, borderTopWidth: 1, borderTopColor: colors.outlineSoft },
  answerLabel: { color: colors.text, fontSize: 12, fontWeight: '800', flexShrink: 1 },
  answerValue: { color: colors.variant, fontSize: 13 },
  relation: { padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceLow, gap: spacing.xs },
  relationTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  relationMeta: { color: colors.primary, fontWeight: '800', fontSize: 12 },
  component: { backgroundColor: colors.surfaceCard, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.outlineSoft, overflow: 'hidden' },
  componentHeader: { flexDirection: 'row', alignItems: 'center', padding: spacing.sm, gap: spacing.xs },
  componentName: { color: colors.text, fontWeight: '800', fontSize: 12 },
  componentFields: { padding: spacing.sm, gap: spacing.xs },
  checklistItem: { backgroundColor: colors.surfaceLow, padding: spacing.sm, gap: spacing.xs, borderRadius: radius.sm },
  done: { color: colors.success, fontWeight: '900' },
  pending: { color: colors.warning, fontWeight: '900' },
  pendingNote: { color: colors.variant, fontSize: 12, lineHeight: 18 },
});

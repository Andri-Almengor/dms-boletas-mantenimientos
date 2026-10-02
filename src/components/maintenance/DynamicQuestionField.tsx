import { OptionItem, OptionSheet } from '@/components/forms/OptionSheet';
import {
  MaintenanceQuestion,
  questionsForDevice,
} from '@/features/maintenance/maintenanceQuestions';
import {
  normalizeProjectRelationValue,
  projectQuestionRequired,
  resizeProjectRelation,
  toggleProjectRelation,
} from '@/features/maintenance/maintenanceProject';
import { formatMacAddressInput } from '@/utils/macAddress';
import { colors, radius, sizing, spacing } from '@/theme/tokens';
import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Catalogs = {
  deviceTypes: Record<string, unknown>[];
  manufacturers: Record<string, unknown>[];
  models: Record<string, unknown>[];
  relations: Record<string, unknown>[];
};

type Props = {
  question: MaintenanceQuestion;
  value: unknown;
  disabled?: boolean;
  catalogs: Catalogs;
  allQuestions: MaintenanceQuestion[];
  onChange: (value: unknown) => void;
};

function text(value: unknown) {
  return String(value ?? '').trim();
}

function inputText(value: unknown) {
  return String(value ?? '');
}

function first(
  row: Record<string, unknown> | undefined,
  keys: string[],
  fallback = '',
) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && text(value)) return text(value);
  }
  return fallback;
}

function options(
  rows: Record<string, unknown>[],
  valueKeys: string[],
): OptionItem[] {
  return rows.map((row) => ({
    value: first(row, valueKeys),
    label: first(row, ['Nombre', 'nombre'], 'Sin nombre'),
  })).filter((item) => item.value);
}

function Choice({
  values,
  value,
  disabled,
  onChange,
}: {
  values: string[];
  value: unknown;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.choices}>
      {values.map((item) => (
        <Pressable
          key={item}
          disabled={disabled}
          onPress={() => onChange(item)}
          style={[
            styles.choice,
            String(value ?? '') === item && styles.choiceSelected,
          ]}
        >
          <Text style={[
            styles.choiceText,
            String(value ?? '') === item && styles.choiceTextSelected,
          ]}>
            {item}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function ProjectRelationField({
  question,
  value,
  disabled = false,
  catalogs,
  allQuestions,
  onChange,
}: Props) {
  const relatedTypeId = question.relatedTypeId;
  const relatedType = catalogs.deviceTypes.find(
    (row) => first(row, ['TipoDispositivoID', 'id']) === relatedTypeId,
  );
  const relatedTypeName = first(relatedType, ['Nombre'], 'Dispositivo relacionado');
  const relation = normalizeProjectRelationValue(value, {
    relatedTypeId,
    relatedTypeName,
  });
  const fields = new Set(
    Array.isArray(question.config.fields)
      ? question.config.fields.map(String)
      : [],
  );
  const manufacturerIds = new Set(
    catalogs.relations
      .filter((row) => first(row, ['TipoDispositivoID']) === relatedTypeId)
      .map((row) => first(row, ['FabricanteID']))
      .filter(Boolean),
  );
  const manufacturerRows = manufacturerIds.size
    ? catalogs.manufacturers.filter((row) => manufacturerIds.has(first(row, ['FabricanteID', 'id'])))
    : catalogs.manufacturers;

  function patchItem(localId: string, patch: Record<string, unknown>) {
    onChange({
      ...relation,
      items: relation.items.map((item) => (
        text(item.localId) === localId
          ? { ...item, ...patch, localId: item.localId }
          : item
      )),
    });
  }

  return (
    <View style={styles.relation}>
      <View style={styles.relationHeader}>
        <View style={styles.relationHeading}>
          <Text style={styles.label}>
            {question.label}{projectQuestionRequired(question) ? ' *' : ''}
          </Text>
          <Text style={styles.hint}>{relatedTypeName}</Text>
        </View>
        <Choice
          values={['Sí', 'No']}
          value={relation.enabled ? 'Sí' : 'No'}
          disabled={disabled}
          onChange={(next) => onChange(toggleProjectRelation(
            relation,
            next === 'Sí',
            { relatedTypeId, relatedTypeName },
          ))}
        />
      </View>

      {relation.enabled ? (
        <>
          {fields.has('cantidad') ? (
            <View style={styles.field}>
              <Text style={styles.label}>Cantidad</Text>
              <TextInput
                editable={!disabled}
                value={String(relation.quantity || 1)}
                onChangeText={(next) => onChange(resizeProjectRelation(
                  relation,
                  Math.max(1, Number(next || 1)),
                  { relatedTypeId, relatedTypeName },
                ))}
                keyboardType="number-pad"
                style={styles.input}
              />
            </View>
          ) : null}

          {relation.items.map((item, index) => {
            const manufacturerId = text(item.fabricanteId);
            const modelRows = catalogs.models.filter((row) => (
              (!first(row, ['TipoDispositivoID']) || first(row, ['TipoDispositivoID']) === relatedTypeId)
              && (!manufacturerId || first(row, ['FabricanteID']) === manufacturerId)
            ));
            const childQuestions = questionsForDevice(
              allQuestions,
              item,
              'PROYECTO',
            ).filter((entry) => entry.responseType !== 'RELACION_DISPOSITIVO');

            return (
              <View key={text(item.localId)} style={styles.component}>
                <Text style={styles.componentTitle}>{relatedTypeName} {index + 1}</Text>

                {fields.has('fabricante') || fields.has('modelo') ? (
                  <OptionSheet
                    label="Fabricante"
                    value={manufacturerId}
                    options={options(manufacturerRows, ['FabricanteID', 'id'])}
                    disabled={disabled}
                    onChange={(selected) => {
                      const id = String(selected);
                      const row = manufacturerRows.find((entry) => first(entry, ['FabricanteID', 'id']) === id);
                      patchItem(text(item.localId), {
                        fabricanteId: id,
                        fabricante: first(row, ['Nombre']),
                        modeloId: '',
                        modelo: '',
                      });
                    }}
                  />
                ) : null}

                {fields.has('modelo') ? (
                  <OptionSheet
                    label="Modelo"
                    value={text(item.modeloId)}
                    options={options(modelRows, ['ModeloID', 'id'])}
                    disabled={disabled || !manufacturerId}
                    onChange={(selected) => {
                      const id = String(selected);
                      const row = modelRows.find((entry) => first(entry, ['ModeloID', 'id']) === id);
                      patchItem(text(item.localId), {
                        modeloId: id,
                        modelo: first(row, ['Nombre']),
                      });
                    }}
                  />
                ) : null}

                {fields.has('nombre') ? (
                  <LabeledInput
                    label="Nombre / identificador"
                    value={inputText(item.nombre)}
                    disabled={disabled}
                    onChange={(next) => patchItem(text(item.localId), { nombre: next })}
                  />
                ) : null}
                {fields.has('serie') ? (
                  <LabeledInput
                    label="Serie"
                    value={inputText(item.serie)}
                    disabled={disabled}
                    onChange={(next) => patchItem(text(item.localId), { serie: next })}
                  />
                ) : null}
                {fields.has('mac') ? (
                  <LabeledInput
                    label="Dirección MAC"
                    value={text(item.macAddress)}
                    disabled={disabled}
                    onChange={(next) => patchItem(text(item.localId), {
                      macAddress: formatMacAddressInput(next),
                    })}
                  />
                ) : null}

                {childQuestions.map((child) => (
                  <DynamicQuestionField
                    key={child.questionId || child.key}
                    question={child}
                    value={(item.respuestas as Record<string, unknown> | undefined)?.[child.key] ?? child.value ?? ''}
                    disabled={disabled}
                    catalogs={catalogs}
                    allQuestions={allQuestions}
                    onChange={(next) => {
                      const answers = {
                        ...((item.respuestas as Record<string, unknown> | undefined) || {}),
                        [child.key]: next,
                      };
                      const details = Array.isArray(item.questionDetails)
                        ? [...item.questionDetails as Record<string, unknown>[]]
                        : [];
                      const detailIndex = details.findIndex(
                        (entry) => text(entry.key || entry.Clave) === child.key,
                      );
                      const detail = {
                        questionId: child.questionId,
                        typeId: child.typeId || relatedTypeId,
                        key: child.key,
                        label: child.label,
                        order: child.order,
                        responseType: child.responseType,
                        appliesTo: child.appliesTo || 'PROYECTO',
                        relatedTypeId: child.relatedTypeId,
                        config: child.config,
                        value: next,
                        activeAtSave: true,
                      };
                      if (detailIndex >= 0) details[detailIndex] = { ...details[detailIndex], ...detail };
                      else details.push(detail);
                      patchItem(text(item.localId), {
                        respuestas: answers,
                        questionDetails: details,
                      });
                    }}
                  />
                ))}
              </View>
            );
          })}
        </>
      ) : null}
    </View>
  );
}

function LabeledInput({
  label,
  value,
  disabled,
  multiline = false,
  keyboardType,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  multiline?: boolean;
  keyboardType?: 'default' | 'numeric' | 'number-pad';
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        editable={!disabled}
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        keyboardType={keyboardType}
        style={[styles.input, multiline && styles.textarea]}
      />
    </View>
  );
}

export function DynamicQuestionField(props: Props) {
  const {
    question,
    value,
    disabled = false,
    onChange,
  } = props;
  const required = projectQuestionRequired(question);
  const type = question.responseType.toUpperCase();

  if (type === 'RELACION_DISPOSITIVO') {
    return <ProjectRelationField {...props} disabled={disabled} />;
  }

  if (type === 'SI_NO') {
    return (
      <View style={styles.field}>
        <Text style={styles.label}>{question.label}{required ? ' *' : ''}</Text>
        <Choice
          values={['Sí', 'No']}
          value={value}
          disabled={disabled}
          onChange={onChange}
        />
      </View>
    );
  }

  if (type === 'OPCIONES') {
    const configured = Array.isArray(question.config.options)
      ? question.config.options.map(String)
      : [];
    return (
      <OptionSheet
        label={`${question.label}${required ? ' *' : ''}`}
        value={String(value ?? '')}
        options={configured.map((entry) => ({ value: entry, label: entry }))}
        disabled={disabled}
        onChange={(next) => onChange(String(next))}
      />
    );
  }

  return (
    <LabeledInput
      label={`${question.label}${required ? ' *' : ''}`}
      value={String(value ?? '')}
      disabled={disabled}
      keyboardType={type === 'NUMERO' || type === 'CANTIDAD' ? 'numeric' : 'default'}
      onChange={(next) => onChange(
        type === 'MAC' ? formatMacAddressInput(next) : next,
      )}
    />
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { color: colors.text, fontWeight: '800', fontSize: 12 },
  hint: { color: colors.muted, fontSize: 10, marginTop: 2 },
  input: {
    minHeight: sizing.controlHeight,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    backgroundColor: colors.surfaceCard,
    color: colors.text,
    paddingHorizontal: spacing.sm,
  },
  textarea: { minHeight: 92, textAlignVertical: 'top', paddingTop: spacing.sm },
  choices: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  choice: {
    minHeight: 42,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    backgroundColor: colors.surfaceCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  choiceText: { color: colors.muted, fontWeight: '800', fontSize: 12 },
  choiceTextSelected: { color: '#fff' },
  relation: {
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineSoft,
    backgroundColor: colors.surfaceLow,
    gap: spacing.sm,
  },
  relationHeader: { gap: spacing.xs },
  relationHeading: { gap: 2 },
  component: {
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineSoft,
    gap: spacing.sm,
  },
  componentTitle: { color: colors.text, fontWeight: '900', fontSize: 14 },
});

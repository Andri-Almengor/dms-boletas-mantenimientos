import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import {
  MaintenanceListFilters,
} from '@/features/maintenance/maintenanceListDomain';
import { colors, radius, sizing, spacing } from '@/theme/tokens';
import React, { useEffect, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type Props = {
  visible: boolean;
  filters: MaintenanceListFilters;
  clients: string[];
  onClose: () => void;
  onApply: (filters: MaintenanceListFilters) => void;
  onClear: () => void;
};

type DateField = 'dateFrom' | 'dateTo';

function parseDate(value: string) {
  if (!value) return new Date();
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function dateKey(value: Date) {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-');
}

export function MaintenanceFilterModal({
  visible,
  filters,
  clients,
  onClose,
  onApply,
  onClear,
}: Props) {
  const [draft, setDraft] = useState(filters);
  const [dateField, setDateField] = useState<DateField | null>(null);
  const invalidRange = Boolean(
    draft.dateFrom
      && draft.dateTo
      && draft.dateFrom > draft.dateTo,
  );

  useEffect(() => {
    if (visible) {
      setDraft(filters);
      setDateField(null);
    }
  }, [visible, filters]);

  function chooseDate(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android' || event.type === 'dismissed') {
      const field = dateField;
      setDateField(null);
      if (event.type === 'dismissed' || !selected || !field) return;
      setDraft((current) => ({ ...current, [field]: dateKey(selected) }));
      return;
    }
    if (selected && dateField) {
      setDraft((current) => ({ ...current, [dateField]: dateKey(selected) }));
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.safe}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.headerAction}>Cancelar</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Filtros</Text>
          <Pressable
            onPress={() => !invalidRange && onApply(draft)}
            disabled={invalidRange}
            hitSlop={12}
          >
            <Text style={[
              styles.headerAction,
              styles.applyAction,
              invalidRange && styles.disabled,
            ]}>
              Aplicar
            </Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.section}>
            <Text style={styles.label}>Cliente</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              <Pressable
                onPress={() => setDraft((current) => ({ ...current, client: '' }))}
                style={[
                  styles.chip,
                  !draft.client && styles.chipActive,
                ]}
              >
                <Text style={[
                  styles.chipText,
                  !draft.client && styles.chipTextActive,
                ]}>
                  Todos
                </Text>
              </Pressable>
              {clients.map((client) => (
                <Pressable
                  key={client}
                  onPress={() => setDraft((current) => ({ ...current, client }))}
                  style={[
                    styles.chip,
                    draft.client === client && styles.chipActive,
                  ]}
                >
                  <Text style={[
                    styles.chipText,
                    draft.client === client && styles.chipTextActive,
                  ]}>
                    {client}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Rango de fechas</Text>
            <View style={styles.dateRow}>
              <Pressable
                style={styles.dateButton}
                onPress={() => setDateField('dateFrom')}
              >
                <Text style={styles.dateLabel}>Desde</Text>
                <Text style={styles.dateValue}>{draft.dateFrom || 'Sin límite'}</Text>
              </Pressable>
              <Pressable
                style={styles.dateButton}
                onPress={() => setDateField('dateTo')}
              >
                <Text style={styles.dateLabel}>Hasta</Text>
                <Text style={styles.dateValue}>{draft.dateTo || 'Sin límite'}</Text>
              </Pressable>
            </View>
            {invalidRange ? (
              <Text style={styles.error}>
                La fecha inicial no puede ser posterior a la fecha final.
              </Text>
            ) : null}

            {dateField ? (
              <View style={styles.picker}>
                <DateTimePicker
                  mode="date"
                  value={parseDate(draft[dateField])}
                  onChange={chooseDate}
                  maximumDate={dateField === 'dateFrom' && draft.dateTo
                    ? parseDate(draft.dateTo)
                    : undefined}
                  minimumDate={dateField === 'dateTo' && draft.dateFrom
                    ? parseDate(draft.dateFrom)
                    : undefined}
                />
                {Platform.OS === 'ios' ? (
                  <Pressable style={styles.pickerDone} onPress={() => setDateField(null)}>
                    <Text style={styles.pickerDoneText}>Listo</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>

          <Pressable
            style={styles.clearButton}
            onPress={() => {
              setDraft({ client: '', dateFrom: '', dateTo: '' });
              onClear();
            }}
          >
            <Text style={styles.clearText}>Limpiar filtros</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    minHeight: 58,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outlineSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceCard,
  },
  headerTitle: { color: colors.text, fontWeight: '900', fontSize: 17 },
  headerAction: { color: colors.muted, fontWeight: '700', fontSize: 15 },
  applyAction: { color: colors.primary },
  disabled: { opacity: 0.35 },
  content: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.xl },
  section: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceCard,
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineSoft,
  },
  label: { color: colors.text, fontWeight: '800', fontSize: 15 },
  chips: { gap: spacing.xs, paddingRight: spacing.md },
  chip: {
    minHeight: sizing.touchTargetMin,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceCard,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.muted, fontWeight: '700' },
  chipTextActive: { color: '#fff' },
  dateRow: { flexDirection: 'row', gap: spacing.sm },
  dateButton: {
    flex: 1,
    minHeight: 70,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceLow,
    justifyContent: 'center',
  },
  dateLabel: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  dateValue: { color: colors.text, fontWeight: '800', marginTop: 4 },
  error: { color: colors.danger, fontSize: 12 },
  picker: {
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceLow,
  },
  pickerDone: { alignSelf: 'flex-end', padding: spacing.sm },
  pickerDoneText: { color: colors.primary, fontWeight: '800' },
  clearButton: {
    minHeight: sizing.buttonHeight,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceCard,
  },
  clearText: { color: colors.danger, fontWeight: '800' },
});

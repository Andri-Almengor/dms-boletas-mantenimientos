import { colors, radius, sizing, spacing } from '@/theme/tokens';
import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

export type OptionItem = {
  value: string;
  label: string;
  note?: string;
};

type Props = {
  label: string;
  value?: string;
  values?: string[];
  options: OptionItem[];
  placeholder?: string;
  disabled?: boolean;
  multiple?: boolean;
  onChange: (value: string | string[]) => void;
};

export function OptionSheet({
  label,
  value = '',
  values = [],
  options,
  placeholder = 'Seleccione…',
  disabled = false,
  multiple = false,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selectedValues = multiple ? values : value ? [value] : [];
  const selectedLabels = options
    .filter((item) => selectedValues.includes(item.value))
    .map((item) => item.label);
  const display = selectedLabels.length
    ? selectedLabels.join(', ')
    : placeholder;

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter((item) => (
      `${item.label} ${item.note || ''}`.toLowerCase().includes(normalized)
    ));
  }, [options, query]);

  function select(item: OptionItem) {
    if (!multiple) {
      onChange(item.value);
      setOpen(false);
      setQuery('');
      return;
    }
    const next = selectedValues.includes(item.value)
      ? selectedValues.filter((entry) => entry !== item.value)
      : [...selectedValues, item.value];
    onChange(next);
  }

  return (
    <>
      <View style={styles.field}>
        <Text style={styles.label}>{label}</Text>
        <Pressable
          disabled={disabled}
          onPress={() => setOpen(true)}
          style={({ pressed }) => [
            styles.control,
            disabled && styles.disabled,
            pressed && !disabled && styles.pressed,
          ]}
        >
          <Text
            style={[
              styles.controlText,
              !selectedLabels.length && styles.placeholder,
            ]}
            numberOfLines={2}
          >
            {display}
          </Text>
          <Text style={styles.chevron}>⌄</Text>
        </Pressable>
      </View>

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.modal}>
          <View style={styles.header}>
            <Pressable onPress={() => setOpen(false)} hitSlop={10}>
              <Text style={styles.cancel}>Cerrar</Text>
            </Pressable>
            <Text style={styles.title}>{label}</Text>
            <View style={styles.headerSpacer} />
          </View>

          <View style={styles.searchWrap}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Buscar…"
              placeholderTextColor={colors.muted}
              style={styles.search}
              autoCorrect={false}
            />
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(item) => item.value}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              const selected = selectedValues.includes(item.value);
              return (
                <Pressable
                  onPress={() => select(item)}
                  style={({ pressed }) => [
                    styles.row,
                    selected && styles.rowSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.rowBody}>
                    <Text style={styles.rowLabel}>{item.label}</Text>
                    {item.note ? <Text style={styles.rowNote}>{item.note}</Text> : null}
                  </View>
                  <Text style={[
                    styles.check,
                    selected && styles.checkSelected,
                  ]}>
                    {selected ? '✓' : '○'}
                  </Text>
                </Pressable>
              );
            }}
            ListEmptyComponent={(
              <View style={styles.empty}>
                <Text style={styles.emptyText}>Sin opciones locales disponibles.</Text>
              </View>
            )}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { color: colors.text, fontWeight: '800', fontSize: 12 },
  control: {
    minHeight: sizing.controlHeight,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    backgroundColor: colors.surfaceCard,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  controlText: { flex: 1, color: colors.text, fontSize: 14 },
  placeholder: { color: colors.muted },
  chevron: { color: colors.primary, fontSize: 19 },
  disabled: { opacity: 0.48 },
  pressed: { opacity: 0.75 },
  modal: { flex: 1, backgroundColor: colors.surface },
  header: {
    minHeight: 58,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outlineSoft,
    backgroundColor: colors.surfaceCard,
  },
  cancel: { width: 60, color: colors.primary, fontWeight: '800' },
  title: {
    flex: 1,
    color: colors.text,
    textAlign: 'center',
    fontWeight: '900',
    fontSize: 17,
  },
  headerSpacer: { width: 60 },
  searchWrap: { padding: spacing.md, paddingBottom: spacing.xs },
  search: {
    minHeight: sizing.controlHeight,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    paddingHorizontal: spacing.sm,
    color: colors.text,
  },
  list: { padding: spacing.md, gap: spacing.xs, paddingBottom: spacing.xl },
  row: {
    minHeight: 58,
    borderRadius: radius.md,
    padding: spacing.sm,
    backgroundColor: colors.surfaceCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineSoft,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  rowBody: { flex: 1 },
  rowLabel: { color: colors.text, fontWeight: '800' },
  rowNote: { color: colors.muted, fontSize: 11, marginTop: 3 },
  check: { color: colors.muted, fontSize: 20 },
  checkSelected: { color: colors.primary, fontWeight: '900' },
  empty: { padding: spacing.xl, alignItems: 'center' },
  emptyText: { color: colors.muted, textAlign: 'center' },
});

import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { colors, radius, sizing, spacing } from '@/theme/tokens';
import React, { useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type Props = {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
};

function parseDate(value: string) {
  const parsed = new Date(`${value || '2000-01-01'}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function dateKey(value: Date) {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-');
}

export function NativeDateField({
  label,
  value,
  disabled = false,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);

  function change(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') setOpen(false);
    if (event.type === 'dismissed') {
      setOpen(false);
      return;
    }
    if (selected) onChange(dateKey(selected));
  }

  return (
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
        <Text style={styles.value}>{value || 'Seleccione fecha'}</Text>
        <Text style={styles.icon}>▣</Text>
      </Pressable>
      {open ? (
        <View style={styles.pickerWrap}>
          <DateTimePicker
            value={parseDate(value)}
            mode="date"
            onChange={change}
          />
          {Platform.OS === 'ios' ? (
            <Pressable onPress={() => setOpen(false)} style={styles.done}>
              <Text style={styles.doneText}>Listo</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
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
  },
  value: { flex: 1, color: colors.text, fontSize: 14 },
  icon: { color: colors.primary, fontSize: 18 },
  pickerWrap: {
    borderRadius: radius.md,
    backgroundColor: colors.surfaceLow,
    padding: spacing.xs,
  },
  done: { alignSelf: 'flex-end', padding: spacing.xs },
  doneText: { color: colors.primary, fontWeight: '900' },
  disabled: { opacity: 0.48 },
  pressed: { opacity: 0.75 },
});

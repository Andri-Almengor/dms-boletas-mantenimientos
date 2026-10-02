import { colors, radius, sizing, spacing } from '@/theme/tokens';
import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

export type MaintenanceLocationOption = {
  id: string;
  name: string;
  locationId: string;
  locationName: string;
  description?: string;
};

type Props = {
  visible: boolean;
  options: MaintenanceLocationOption[];
  saving?: boolean;
  onClose: () => void;
  onAdd: (location: MaintenanceLocationOption) => void | Promise<void>;
};

export function MaintenanceLocationPickerModal({
  visible,
  options,
  saving = false,
  onClose,
  onAdd,
}: Props) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');

  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setSelectedId('');
  }, [visible]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return options;
    return options.filter((item) => (
      `${item.name} ${item.locationName} ${item.description || ''}`
        .toLocaleLowerCase()
        .includes(normalized)
    ));
  }, [options, query]);

  const selected = options.find((item) => item.id === selectedId) || null;

  async function submit() {
    if (!selected || saving) return;
    await onAdd(selected);
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
            <Text style={styles.eyebrow}>Ubicaciones del cliente</Text>
            <Text style={styles.title}>Agregar al mantenimiento</Text>
          </View>

          <Pressable
            disabled={saving || !selected}
            onPress={submit}
            style={styles.headerAction}
          >
            <Text style={[
              styles.addText,
              (!selected || saving) && styles.disabledText,
            ]}>
              {saving ? 'Agregando…' : 'Agregar'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.intro}>
          <Text style={styles.introIcon}>⌖</Text>
          <Text style={styles.introText}>
            Solo las ubicaciones que agregue aquí aparecerán dentro de este mantenimiento.
          </Text>
        </View>

        <View style={styles.searchWrap}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar ubicación"
            placeholderTextColor={colors.muted}
            autoCorrect={false}
            style={styles.search}
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={10}>
              <Text style={styles.clearText}>×</Text>
            </Pressable>
          ) : null}
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const active = selectedId === item.id;
            return (
              <Pressable
                onPress={() => setSelectedId(item.id)}
                style={({ pressed }) => [
                  styles.row,
                  active && styles.rowActive,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.locationIcon}>
                  <Text style={styles.locationGlyph}>⌖</Text>
                </View>

                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {item.locationName ? (
                    <Text style={styles.rowSubtitle} numberOfLines={1}>
                      {item.locationName}
                    </Text>
                  ) : null}
                  {item.description ? (
                    <Text style={styles.rowDescription} numberOfLines={2}>
                      {item.description}
                    </Text>
                  ) : null}
                </View>

                <Text style={[
                  styles.selection,
                  active && styles.selectionActive,
                ]}>
                  {active ? '✓' : '○'}
                </Text>
              </Pressable>
            );
          }}
          ListEmptyComponent={(
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No hay ubicaciones disponibles</Text>
              <Text style={styles.emptyText}>
                Todas las ubicaciones disponibles ya están agregadas o no hay coincidencias con la búsqueda.
              </Text>
            </View>
          )}
        />
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
    letterSpacing: 0.5,
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
  addText: {
    color: colors.primary,
    textAlign: 'right',
    fontWeight: '900',
  },
  disabledText: {
    opacity: 0.4,
  },
  intro: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  introIcon: {
    color: colors.primary,
    fontWeight: '900',
    fontSize: 20,
  },
  introText: {
    flex: 1,
    color: colors.variant,
    fontSize: 11,
    lineHeight: 17,
  },
  searchWrap: {
    minHeight: sizing.controlHeight,
    margin: spacing.md,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    backgroundColor: colors.surfaceCard,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  searchIcon: {
    color: colors.primary,
    fontSize: 21,
  },
  search: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
  },
  clearText: {
    color: colors.muted,
    fontSize: 22,
  },
  list: {
    padding: spacing.md,
    paddingTop: spacing.xs,
    gap: spacing.xs,
  },
  row: {
    minHeight: 68,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    backgroundColor: colors.surfaceCard,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  locationIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationGlyph: {
    color: colors.primary,
    fontWeight: '900',
    fontSize: 18,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  rowSubtitle: {
    color: colors.muted,
    fontSize: 10,
    marginTop: 3,
  },
  rowDescription: {
    color: colors.muted,
    fontSize: 9,
    lineHeight: 13,
    marginTop: 3,
  },
  selection: {
    color: colors.muted,
    fontSize: 20,
  },
  selectionActive: {
    color: colors.primary,
    fontWeight: '900',
  },
  empty: {
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.xs,
  },
  emptyTitle: {
    color: colors.text,
    fontWeight: '900',
  },
  emptyText: {
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 18,
    fontSize: 11,
  },
  pressed: {
    opacity: 0.76,
  },
});

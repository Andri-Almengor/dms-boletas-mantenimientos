import { NativeDateField } from '@/components/forms/NativeDateField';
import { OptionItem, OptionSheet } from '@/components/forms/OptionSheet';
import { ProjectChecklistEditor } from '@/components/maintenance/ProjectChecklistEditor';
import { useAuth } from '@/auth/AuthProvider';
import { countLocalDevices } from '@/db/deviceRepository';
import {
  getLocalMaintenance,
  saveLocalMaintenance,
} from '@/db/maintenanceRepository';
import { listResourceItems } from '@/db/resourceRepository';
import {
  createMaintenanceEditorForm,
  expectedMaintenanceTotal,
  maintenanceEditorPayload,
  MaintenanceEditorForm,
  mapMaintenanceToEditor,
  validateMaintenanceEditor,
} from '@/features/maintenance/maintenanceEditorDomain';
import {
  canCreateMaintenance,
  canEditMaintenance,
  maintenanceReadOnly,
} from '@/features/maintenance/maintenancePermissions';
import {
  isProjectMaintenance,
} from '@/features/maintenance/maintenanceProject';
import {
  MAINTENANCE_CATEGORIES,
} from '@/features/maintenance/maintenanceCategories';
import { useSync } from '@/sync/SyncProvider';
import { colors, radius, sizing, spacing } from '@/theme/tokens';
import { Redirect, Stack, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Props = {
  mode: 'create' | 'edit';
  maintenanceId?: string;
};

type RecordLike = Record<string, unknown>;

function text(value: unknown) {
  return String(value ?? '').trim();
}

function first(
  row: RecordLike | undefined,
  keys: string[],
  fallback = '',
) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && text(value)) return text(value);
  }
  return fallback;
}

function optionList(
  rows: RecordLike[],
  valueKeys: string[],
  labelKeys: string[],
  noteKeys: string[] = [],
): OptionItem[] {
  return rows.map((row) => ({
    value: first(row, valueKeys),
    label: first(row, labelKeys, 'Sin nombre'),
    note: first(row, noteKeys),
  })).filter((item) => item.value);
}

function ensureOption(
  options: OptionItem[],
  value: string,
  label: string,
) {
  if (!value || options.some((item) => item.value === value)) return options;
  return [...options, { value, label: label || value }];
}

export function MaintenanceEditorScreen({
  mode,
  maintenanceId = '',
}: Props) {
  const db = useSQLiteContext();
  const router = useRouter();
  const {
    user,
    loading: authLoading,
    dataScope,
    permissions,
  } = useAuth();
  const { refreshStatus } = useSync();

  const [form, setForm] = useState<MaintenanceEditorForm | null>(null);
  const [clients, setClients] = useState<RecordLike[]>([]);
  const [locations, setLocations] = useState<RecordLike[]>([]);
  const [users, setUsers] = useState<RecordLike[]>([]);
  const [deviceCount, setDeviceCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const allowed = mode === 'create'
    ? canCreateMaintenance(permissions)
    : canEditMaintenance(permissions);
  const readOnly = form
    ? maintenanceReadOnly(permissions, form.status)
    : false;

  useEffect(() => {
    if (!dataScope || !user) return;
    let active = true;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const [clientRows, userRows] = await Promise.all([
          listResourceItems(db, dataScope, 'client'),
          listResourceItems(db, dataScope, 'assignableUser'),
        ]);
        if (!active) return;
        setClients(clientRows);
        setUsers(userRows.filter((row) => (
          first(row, ['Estado'], 'ACTIVO').toUpperCase() !== 'INACTIVO'
        )));

        if (mode === 'edit') {
          const row = await getLocalMaintenance(
            db,
            dataScope,
            maintenanceId,
          );
          if (!row) throw new Error('El mantenimiento no está disponible en SQLite.');
          const [count] = await Promise.all([
            countLocalDevices(db, dataScope, maintenanceId),
          ]);
          if (!active) return;
          setDeviceCount(count);
          setForm(mapMaintenanceToEditor(row, String(user.UsuarioID || '')));
        } else {
          setDeviceCount(0);
          setForm(createMaintenanceEditorForm(String(user.UsuarioID || '')));
        }
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error
          ? loadError.message
          : 'No se pudo abrir el editor local.');
      } finally {
        if (active) setLoading(false);
      }
    }

    load().catch(() => undefined);
    return () => { active = false; };
  }, [db, dataScope, mode, maintenanceId, user]);

  useEffect(() => {
    if (!dataScope || !form?.clientId) {
      setLocations([]);
      return;
    }
    let active = true;
    listResourceItems(db, dataScope, 'clientLocation', form.clientId)
      .then((rows) => active && setLocations(rows))
      .catch(() => active && setLocations([]));
    return () => { active = false; };
  }, [db, dataScope, form?.clientId]);

  const clientOptions = useMemo(() => ensureOption(
    optionList(clients, ['ClienteID', 'clienteId', 'clientId', 'id'], ['Nombre', 'Cliente', 'Clientes']),
    form?.clientId || '',
    form?.clientName || '',
  ), [clients, form?.clientId, form?.clientName]);

  const locationOptions = useMemo(() => ensureOption(
    optionList(locations, ['UbicacionID', 'ubicacionId', 'locationId', 'id'], ['Nombre', 'Ubicacion']),
    form?.locationId || '',
    form?.locationName || '',
  ), [locations, form?.locationId, form?.locationName]);

  const userOptions = useMemo(() => optionList(
    users,
    ['UsuarioID', 'userId', 'id'],
    ['NombreCompleto', 'Nombre', 'Correo'],
    ['Correo', 'NombreUsuario'],
  ), [users]);

  if (authLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (!user) return <Redirect href="/login" />;
  if (user.CambioPasswordObligatorio) return <Redirect href="/change-password" />;

  if (!allowed) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Mantenimiento' }} />
        <Text style={styles.stateTitle}>Sin permiso para {mode === 'create' ? 'crear' : 'editar'}</Text>
        <Text style={styles.stateText}>
          La aplicación móvil reutiliza los mismos permisos de DMS Boletas.
        </Text>
        <Pressable style={styles.secondaryButton} onPress={() => router.back()}>
          <Text style={styles.secondaryButtonText}>Volver</Text>
        </Pressable>
      </View>
    );
  }

  if (loading || !form) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: mode === 'create' ? 'Nuevo mantenimiento' : 'Editar mantenimiento' }} />
        <ActivityIndicator color={colors.primary} />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>
    );
  }

  function patch(values: Partial<MaintenanceEditorForm>) {
    setForm((current) => current ? { ...current, ...values } : current);
  }

  async function save() {
    if (!form || readOnly || saving) return;
    const validation = validateMaintenanceEditor(form);
    if (validation) {
      setError(validation);
      return;
    }

    setSaving(true);
    setError('');
    try {
      const result = await saveLocalMaintenance(
        db,
        dataScope,
        maintenanceEditorPayload(form, maintenanceId || form.id),
      );
      await refreshStatus();
      router.replace({
        pathname: '/maintenance/[maintenanceId]',
        params: { maintenanceId: result.maintenanceId },
      });
    } catch (saveError) {
      setError(saveError instanceof Error
        ? saveError.message
        : 'No se pudo guardar localmente.');
    } finally {
      setSaving(false);
    }
  }

  const projectMode = isProjectMaintenance(form.maintenanceType);
  const expectedTotal = expectedMaintenanceTotal(form.counts);

  return (
    <>
      <Stack.Screen
        options={{
          title: mode === 'create' ? 'Nuevo mantenimiento' : 'Editar mantenimiento',
        }}
      />
      <View style={styles.screen}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>Edición local-first</Text>
            <Text style={styles.title}>
              {mode === 'create' ? 'Nuevo mantenimiento' : form.title || 'Editar mantenimiento'}
            </Text>
            <Text style={styles.subtitle}>
              Guardar escribe primero en SQLite y deja la operación en la outbox.
            </Text>
            {readOnly ? (
              <View style={styles.warning}>
                <Text style={styles.warningText}>
                  Este mantenimiento está finalizado. Solo un administrador puede editarlo.
                </Text>
              </View>
            ) : null}
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Section title="Información general">
            <Field
              label="Título *"
              value={form.title}
              disabled={readOnly}
              onChange={(title) => patch({ title })}
            />

            <Text style={styles.fieldLabel}>Tipo</Text>
            <View style={styles.choiceRow}>
              {(['MANTENIMIENTO', 'PROYECTO'] as const).map((type) => (
                <Pressable
                  key={type}
                  disabled={readOnly || deviceCount > 0}
                  onPress={() => patch({ maintenanceType: type })}
                  style={[
                    styles.choice,
                    form.maintenanceType === type && styles.choiceSelected,
                    (readOnly || deviceCount > 0) && styles.disabled,
                  ]}
                >
                  <Text style={[
                    styles.choiceText,
                    form.maintenanceType === type && styles.choiceTextSelected,
                  ]}>
                    {type === 'MANTENIMIENTO' ? 'Mantenimiento' : 'Proyecto'}
                  </Text>
                </Pressable>
              ))}
            </View>
            {deviceCount > 0 ? (
              <Text style={styles.hint}>
                El tipo queda bloqueado después de registrar dispositivos, igual que en la web.
              </Text>
            ) : null}

            <OptionSheet
              label="Cliente *"
              value={form.clientId}
              options={clientOptions}
              disabled={readOnly}
              placeholder={clients.length ? 'Seleccione un cliente' : 'Catálogo no descargado'}
              onChange={(selected) => {
                const id = String(selected);
                const option = clientOptions.find((item) => item.value === id);
                patch({
                  clientId: id,
                  clientName: option?.label || '',
                  locationId: '',
                  locationName: '',
                });
              }}
            />

            <OptionSheet
              label="Ubicación"
              value={form.locationId}
              options={locationOptions}
              disabled={readOnly || !form.clientId}
              placeholder={form.clientId
                ? locations.length ? 'Seleccione una ubicación' : 'Sin ubicaciones locales'
                : 'Seleccione primero el cliente'}
              onChange={(selected) => {
                const id = String(selected);
                const option = locationOptions.find((item) => item.value === id);
                patch({ locationId: id, locationName: option?.label || '' });
              }}
            />

            <OptionSheet
              label="Responsables *"
              values={form.responsibleIds}
              options={userOptions}
              multiple
              disabled={readOnly}
              placeholder={users.length ? 'Seleccione responsables' : 'Usuarios no descargados'}
              onChange={(selected) => patch({
                responsibleIds: Array.isArray(selected) ? selected : [String(selected)],
              })}
            />

            <View style={styles.dateGrid}>
              <View style={styles.dateCell}>
                <NativeDateField
                  label="Fecha"
                  value={form.date}
                  disabled={readOnly}
                  onChange={(date) => patch({ date })}
                />
              </View>
              <View style={styles.dateCell}>
                <NativeDateField
                  label="Fecha prevista final"
                  value={form.finalizationDate}
                  disabled={readOnly}
                  onChange={(finalizationDate) => patch({ finalizationDate })}
                />
              </View>
            </View>

            <Field
              label="Descripción"
              value={form.description}
              disabled={readOnly}
              multiline
              onChange={(description) => patch({ description })}
            />
          </Section>

          <Section title={projectMode ? 'Tipos del proyecto' : 'Cantidades esperadas'}>
            <Text style={styles.sectionDescription}>
              Total esperado: {expectedTotal}. Estos valores también limitan los tipos que se pueden agregar como dispositivos.
            </Text>
            <View style={styles.countGrid}>
              {MAINTENANCE_CATEGORIES.map((category) => (
                <View key={category.countField} style={styles.countCard}>
                  <Text style={styles.countLabel}>{category.key}</Text>
                  <View style={styles.counter}>
                    <Pressable
                      disabled={readOnly}
                      onPress={() => patch({
                        counts: {
                          ...form.counts,
                          [category.countField]: Math.max(
                            0,
                            Number(form.counts[category.countField] || 0) - 1,
                          ),
                        },
                      })}
                      style={styles.counterButton}
                    >
                      <Text style={styles.counterButtonText}>−</Text>
                    </Pressable>
                    <TextInput
                      editable={!readOnly}
                      value={String(form.counts[category.countField] || 0)}
                      keyboardType="number-pad"
                      onChangeText={(next) => patch({
                        counts: {
                          ...form.counts,
                          [category.countField]: Math.max(0, Number(next || 0)),
                        },
                      })}
                      style={styles.countInput}
                    />
                    <Pressable
                      disabled={readOnly}
                      onPress={() => patch({
                        counts: {
                          ...form.counts,
                          [category.countField]: Number(form.counts[category.countField] || 0) + 1,
                        },
                      })}
                      style={styles.counterButton}
                    >
                      <Text style={styles.counterButtonText}>+</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          </Section>

          {projectMode ? (
            <Section title="Checklist del proyecto">
              <ProjectChecklistEditor
                counts={form.counts}
                value={form.projectChecklist}
                disabled={readOnly}
                onChange={(projectChecklist) => patch({ projectChecklist })}
              />
            </Section>
          ) : null}

          <View style={styles.localNotice}>
            <Text style={styles.localNoticeTitle}>Guardado local</Text>
            <Text style={styles.localNoticeText}>
              No se requiere Internet para guardar. La sincronización respetará el horario automático o el botón manual.
            </Text>
          </View>
        </ScrollView>

        {!readOnly ? (
          <View style={styles.footer}>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => router.back()}
              disabled={saving}
            >
              <Text style={styles.secondaryButtonText}>Cancelar</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryButton, saving && styles.disabled]}
              onPress={save}
              disabled={saving}
            >
              {saving ? <ActivityIndicator color="#fff" /> : null}
              <Text style={styles.primaryButtonText}>
                {saving ? 'Guardando…' : 'Guardar localmente'}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled = false,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        editable={!disabled}
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        placeholderTextColor={colors.muted}
        style={[
          styles.input,
          multiline && styles.textarea,
          disabled && styles.disabled,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: 110 },
  center: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  stateTitle: { color: colors.text, fontWeight: '900', fontSize: 19 },
  stateText: { color: colors.muted, textAlign: 'center', lineHeight: 20 },
  hero: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
    gap: 4,
  },
  eyebrow: {
    color: colors.primary,
    fontWeight: '900',
    textTransform: 'uppercase',
    fontSize: 10,
  },
  title: { color: colors.text, fontWeight: '900', fontSize: 22 },
  subtitle: { color: colors.variant, lineHeight: 18, fontSize: 12 },
  warning: {
    marginTop: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.warningSoft,
  },
  warningText: { color: colors.warning, fontWeight: '700', fontSize: 12 },
  errorBox: {
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.dangerSoft,
  },
  errorText: { color: colors.danger, fontWeight: '700', textAlign: 'center' },
  section: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineSoft,
    gap: spacing.sm,
  },
  sectionTitle: { color: colors.text, fontWeight: '900', fontSize: 17 },
  sectionDescription: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  field: { gap: 6 },
  fieldLabel: { color: colors.text, fontWeight: '800', fontSize: 12 },
  hint: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  input: {
    minHeight: sizing.controlHeight,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: spacing.sm,
  },
  textarea: {
    minHeight: 96,
    paddingTop: spacing.sm,
    textAlignVertical: 'top',
  },
  choiceRow: { flexDirection: 'row', gap: spacing.xs },
  choice: {
    flex: 1,
    minHeight: sizing.touchTargetMin,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  choiceText: { color: colors.muted, fontWeight: '800', fontSize: 11 },
  choiceTextSelected: { color: '#fff' },
  dateGrid: { gap: spacing.sm },
  dateCell: { flex: 1 },
  countGrid: { gap: spacing.xs },
  countCard: {
    minHeight: 54,
    padding: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceLow,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  countLabel: { flex: 1, color: colors.text, fontWeight: '800', fontSize: 12 },
  counter: { flexDirection: 'row', alignItems: 'center' },
  counterButton: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceCard,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineSoft,
  },
  counterButtonText: { color: colors.primary, fontWeight: '900', fontSize: 19 },
  countInput: {
    width: 52,
    height: 38,
    textAlign: 'center',
    color: colors.text,
    fontWeight: '900',
  },
  localNotice: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.successSoft,
    gap: 3,
  },
  localNoticeTitle: { color: colors.success, fontWeight: '900' },
  localNoticeText: { color: colors.text, fontSize: 11, lineHeight: 17 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.md,
    paddingBottom: spacing.lg,
    backgroundColor: colors.surfaceCard,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.outlineSoft,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  primaryButton: {
    flex: 2,
    minHeight: sizing.buttonHeight,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  primaryButtonText: { color: '#fff', fontWeight: '900' },
  secondaryButton: {
    flex: 1,
    minHeight: sizing.buttonHeight,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    backgroundColor: colors.surfaceCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: { color: colors.text, fontWeight: '800' },
  disabled: { opacity: 0.48 },
});

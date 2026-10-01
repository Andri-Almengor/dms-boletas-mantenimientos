import { NativeDateField } from '@/components/forms/NativeDateField';
import { OptionItem, OptionSheet } from '@/components/forms/OptionSheet';
import { DynamicQuestionField } from '@/components/maintenance/DynamicQuestionField';
import {
  DraftMaintenanceEvidence,
  MaintenanceEvidenceDraftSection,
} from '@/components/maintenance/MaintenanceEvidenceDraftSection';
import { MaintenanceEvidenceManager } from '@/components/maintenance/MaintenanceEvidenceManager';
import { ProjectProgressEditor } from '@/components/maintenance/ProjectProgressEditor';
import { useAuth } from '@/auth/AuthProvider';
import {
  deleteLocalDevice,
  EquipmentLocationDraft,
  saveLocalDeviceWithEvidence,
} from '@/db/deviceRepository';
import {
  readLocalDeviceDetail,
  readLocalMaintenanceDetail,
} from '@/db/maintenanceDetailRepository';
import { getLocalMaintenance } from '@/db/maintenanceRepository';
import { listResourceItems } from '@/db/resourceRepository';
import {
  createDeviceEditorForm,
  deviceCompletion,
  deviceEditorPayload,
  DeviceEditorForm,
  mapDeviceToEditor,
  selectedMaintenanceCategories,
  validateDeviceEditor,
} from '@/features/maintenance/maintenanceEditorDomain';
import {
  canCreateOperationalClientData,
  canDeleteMaintenanceDevice,
  canEditMaintenance,
  maintenanceReadOnly,
} from '@/features/maintenance/maintenancePermissions';
import {
  emptyProjectProgress,
  isProjectMaintenance,
} from '@/features/maintenance/maintenanceProject';
import {
  MaintenanceQuestion,
  normalizeMaintenanceQuestion,
  questionsForDevice,
} from '@/features/maintenance/maintenanceQuestions';
import {
  canonicalMaintenanceCategoryName,
  MAINTENANCE_CATEGORIES,
} from '@/features/maintenance/maintenanceCategories';
import {
  createEvidencePayload,
  projectEvidenceTargets,
} from '@/features/maintenance/maintenanceEvidence';
import { removeLocalEvidenceFile } from '@/services/maintenanceEvidenceStorage';
import { createLocalId } from '@/utils/localId';
import { formatMacAddressInput } from '@/utils/macAddress';
import { useSync } from '@/sync/SyncProvider';
import { colors, radius, sizing, spacing } from '@/theme/tokens';
import {
  Redirect,
  Stack,
  useRouter,
} from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Props = {
  mode: 'create' | 'edit';
  maintenanceId: string;
  deviceId?: string;
};

type RecordLike = Record<string, unknown>;

type CatalogState = {
  deviceTypes: RecordLike[];
  manufacturers: RecordLike[];
  models: RecordLike[];
  relations: RecordLike[];
  users: RecordLike[];
  clientLocations: RecordLike[];
  equipment: RecordLike[];
  questions: MaintenanceQuestion[];
};

const EMPTY_CATALOGS: CatalogState = {
  deviceTypes: [],
  manufacturers: [],
  models: [],
  relations: [],
  users: [],
  clientLocations: [],
  equipment: [],
  questions: [],
};

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

function parseObject(value: unknown) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as RecordLike;
  }
  try {
    const parsed = JSON.parse(String(value || '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as RecordLike
      : {};
  } catch {
    return {};
  }
}

export function DeviceEditorScreen({
  mode,
  maintenanceId,
  deviceId = '',
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

  const [maintenance, setMaintenance] = useState<RecordLike | null>(null);
  const [detailComplete, setDetailComplete] = useState(false);
  const [form, setForm] = useState<DeviceEditorForm | null>(null);
  const [catalogs, setCatalogs] = useState<CatalogState>(EMPTY_CATALOGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [draftEvidence, setDraftEvidence] = useState<DraftMaintenanceEvidence[]>([]);
  const draftEvidenceRef = useRef<DraftMaintenanceEvidence[]>([]);
  const draftDeviceIdRef = useRef(
    mode === 'create' ? createLocalId('dispositivo') : deviceId,
  );
  const savedDraftRef = useRef(false);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [locationDraft, setLocationDraft] = useState<EquipmentLocationDraft | null>(null);
  const [newLocationParentId, setNewLocationParentId] = useState('');
  const [newLocationName, setNewLocationName] = useState('');
  const [newLocationDescription, setNewLocationDescription] = useState('');

  const allowed = canEditMaintenance(permissions);
  const readOnly = maintenance
    ? maintenanceReadOnly(permissions, maintenance.Estado)
    : false;

  useEffect(() => {
    if (!dataScope || !user || !maintenanceId) return;
    const currentUserId = String(user.UsuarioID || '');
    let active = true;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const [maintenanceRow, localDetail] = await Promise.all([
          getLocalMaintenance(db, dataScope, maintenanceId),
          readLocalMaintenanceDetail(db, dataScope, maintenanceId),
        ]);
        if (!maintenanceRow) {
          throw new Error('El mantenimiento no está disponible en SQLite.');
        }

        const locationId = first(maintenanceRow, ['UbicacionID', 'ubicacionId']);
        const clientId = first(
          maintenanceRow,
          ['ClienteID', 'ClienteRef', 'clienteId'],
        );
        const [
          deviceTypes,
          manufacturers,
          models,
          relations,
          users,
          clientLocationRows,
          maintenanceConfig,
        ] = await Promise.all([
          listResourceItems(db, dataScope, 'deviceType'),
          listResourceItems(db, dataScope, 'manufacturer'),
          listResourceItems(db, dataScope, 'model'),
          listResourceItems(db, dataScope, 'deviceManufacturerRelation'),
          listResourceItems(db, dataScope, 'assignableUser'),
          clientId
            ? listResourceItems(db, dataScope, 'clientLocation', clientId)
            : Promise.resolve([]),
          listResourceItems(db, dataScope, 'maintenanceConfig'),
        ]);

        const fallbackLocation = locationId
          && !clientLocationRows.some((row) => (
            first(row, ['UbicacionID', 'ubicacionId', 'id']) === locationId
          ))
          ? [{
              UbicacionID: locationId,
              Nombre: first(
                maintenanceRow,
                ['Ubicacion', 'ubicacion'],
                'Ubicación del mantenimiento',
              ),
            }]
          : [];
        const clientLocations = [
          ...clientLocationRows,
          ...fallbackLocation,
        ];
        const equipmentGroups = await Promise.all(
          clientLocations.map((row) => {
            const parentId = first(
              row,
              ['UbicacionID', 'ubicacionId', 'id'],
            );
            return parentId
              ? listResourceItems(
                  db,
                  dataScope,
                  'equipmentLocation',
                  parentId,
                )
              : Promise.resolve([]);
          }),
        );
        const equipment = equipmentGroups.flat();

        const config = maintenanceConfig[0] || {};
        const rawQuestions = Array.isArray(config.questions)
          ? config.questions as RecordLike[]
          : [];
        const questionRows = rawQuestions.map(normalizeMaintenanceQuestion);

        let nextForm: DeviceEditorForm;
        if (mode === 'edit') {
          const localDevice = await readLocalDeviceDetail(
            db,
            dataScope,
            maintenanceId,
            deviceId,
          );
          if (!localDevice) {
            throw new Error('El dispositivo no está disponible en SQLite.');
          }
          nextForm = mapDeviceToEditor(
            localDevice.device,
            first(maintenanceRow, ['TipoMantenimiento'], 'MANTENIMIENTO'),
          );
        } else {
          if (!localDetail?.detailComplete) {
            throw new Error(
              'Descargue primero el detalle del mantenimiento antes de agregar dispositivos.',
            );
          }
          nextForm = createDeviceEditorForm(
            first(maintenanceRow, ['TipoMantenimiento'], 'MANTENIMIENTO'),
          );
          const counts = parseObject(maintenanceRow.CantidadesJSON);
          const selected = selectedMaintenanceCategories(
            Object.fromEntries(
              Object.entries(counts).map(([key, value]) => [key, Number(value || 0)]),
            ),
          );
          if (!selected.length) {
            throw new Error(
              'Primero indique una cantidad mayor que cero para al menos un tipo de dispositivo.',
            );
          }
          const initialCategory = selected[0];
          const typeRow = deviceTypes.find((row) => (
            canonicalMaintenanceCategoryName(first(row, ['Nombre'])) === initialCategory.key
          ));
          nextForm = {
            ...nextForm,
            category: initialCategory.key,
            deviceTypeId: first(typeRow, ['TipoDispositivoID', 'id']),
            technicianIds: currentUserId ? [currentUserId] : [],
            answers: {},
          };
        }

        if (!active) return;
        setMaintenance(maintenanceRow);
        setDetailComplete(Boolean(localDetail?.detailComplete));
        setCatalogs({
          deviceTypes,
          manufacturers,
          models,
          relations,
          users: users.filter((row) => (
            first(row, ['Estado'], 'ACTIVO').toUpperCase() !== 'INACTIVO'
          )),
          clientLocations,
          equipment,
          questions: questionRows,
        });
        setForm(nextForm);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error
          ? loadError.message
          : 'No se pudo abrir el editor del dispositivo.');
      } finally {
        if (active) setLoading(false);
      }
    }

    load().catch(() => undefined);
    return () => { active = false; };
  }, [db, dataScope, user, maintenanceId, deviceId, mode]);

  useEffect(() => {
    draftEvidenceRef.current = draftEvidence;
  }, [draftEvidence]);

  useEffect(() => () => {
    if (savedDraftRef.current) return;
    for (const item of draftEvidenceRef.current) {
      removeLocalEvidenceFile(item.localUri).catch(() => undefined);
    }
  }, []);

  const maintenanceType = first(
    maintenance || undefined,
    ['TipoMantenimiento'],
    'MANTENIMIENTO',
  );
  const projectMode = isProjectMaintenance(maintenanceType);
  const maintenanceCounts = useMemo(() => {
    const parsed = parseObject(maintenance?.CantidadesJSON);
    const counts = Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [key, Number(value || 0)]),
    );
    for (const category of MAINTENANCE_CATEGORIES) {
      const direct = maintenance?.[category.countField];
      if (direct !== undefined && direct !== null && direct !== '') {
        counts[category.countField] = Math.max(0, Number(direct || 0));
      }
    }
    return counts;
  }, [maintenance]);

  const selectedCategories = useMemo(
    () => selectedMaintenanceCategories(maintenanceCounts),
    [maintenanceCounts],
  );

  const allowedTypeOptions = useMemo(() => {
    const options: OptionItem[] = [];
    for (const category of selectedCategories) {
      const row = catalogs.deviceTypes.find((item) => (
        canonicalMaintenanceCategoryName(first(item, ['Nombre'])) === category.key
      ));
      const typeId = first(row, ['TipoDispositivoID', 'id']);
      options.push({
        value: typeId || `legacy:${category.key}`,
        label: category.key,
      });
    }
    if (
      form?.category
      && !options.some((item) => item.label === canonicalMaintenanceCategoryName(form.category))
    ) {
      options.push({
        value: form.deviceTypeId || `legacy:${form.category}`,
        label: canonicalMaintenanceCategoryName(form.category),
      });
    }
    return options;
  }, [selectedCategories, catalogs.deviceTypes, form?.category, form?.deviceTypeId]);

  const manufacturerRows = useMemo(() => {
    if (!form?.deviceTypeId) return catalogs.manufacturers;
    const ids = new Set(
      catalogs.relations
        .filter((row) => (
          first(row, ['TipoDispositivoID']) === form.deviceTypeId
          && first(row, ['Activo'], 'true').toLowerCase() !== 'false'
        ))
        .map((row) => first(row, ['FabricanteID']))
        .filter(Boolean),
    );
    return ids.size
      ? catalogs.manufacturers.filter((row) => ids.has(first(row, ['FabricanteID', 'id'])))
      : catalogs.manufacturers;
  }, [catalogs.manufacturers, catalogs.relations, form?.deviceTypeId]);

  const modelRows = useMemo(() => {
    if (!form) return [];
    return catalogs.models.filter((row) => (
      (!first(row, ['TipoDispositivoID']) || first(row, ['TipoDispositivoID']) === form.deviceTypeId)
      && (!form.manufacturerId || first(row, ['FabricanteID']) === form.manufacturerId)
    ));
  }, [catalogs.models, form]);

  const questions = useMemo(() => {
    if (!form) return [];
    return questionsForDevice(
      catalogs.questions,
      {
        tipoDispositivoId: form.deviceTypeId,
        categoria: form.category,
        respuestas: form.answers,
        questionDetails: form.questionDetails,
      },
      maintenanceType,
    );
  }, [catalogs.questions, form, maintenanceType]);

  const completion = useMemo(
    () => form && maintenance
      ? deviceCompletion(
          form,
          questions,
          maintenance.ProyectoChecklistJSON || maintenance.projectChecklist,
        )
      : { complete: false, missing: [] as string[] },
    [form, questions, maintenance],
  );

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
        <Stack.Screen options={{ title: 'Dispositivo' }} />
        <Text style={styles.stateTitle}>Sin permiso para editar</Text>
        <Text style={styles.stateText}>
          La aplicación reutiliza los permisos actuales de DMS Boletas.
        </Text>
      </View>
    );
  }

  if (loading || !form || !maintenance) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: mode === 'create' ? 'Agregar dispositivo' : 'Editar dispositivo' }} />
        {loading ? <ActivityIndicator color={colors.primary} /> : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {!loading ? (
          <Pressable style={styles.secondaryButton} onPress={() => router.back()}>
            <Text style={styles.secondaryButtonText}>Volver</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  function patch(values: Partial<DeviceEditorForm>) {
    setForm((current) => current ? { ...current, ...values } : current);
  }

  async function save() {
    if (!form || !maintenance || readOnly || saving) return;
    const currentForm = form;
    const currentMaintenance = maintenance;
    const validation = validateDeviceEditor(
      currentForm,
      questions,
      currentMaintenance.ProyectoChecklistJSON || currentMaintenance.projectChecklist,
      catalogs.questions,
    );
    if (validation) {
      setError(validation);
      return;
    }

    const requestedDeviceId = currentForm.id
      || draftDeviceIdRef.current
      || createLocalId('dispositivo');
    draftDeviceIdRef.current = requestedDeviceId;

    const devicePayload = {
      ...deviceEditorPayload(
        currentForm,
        maintenanceId,
        questions,
        currentMaintenance.ProyectoChecklistJSON || currentMaintenance.projectChecklist,
      ),
      EvidenciaMantenimientoID: requestedDeviceId,
      deviceId: requestedDeviceId,
    };
    const evidenceTargets = projectMode
      ? projectEvidenceTargets(devicePayload)
      : [];

    const preparedEvidence = mode === 'create'
      ? draftEvidence.map((item) => {
          const target = projectMode
            ? evidenceTargets.find(
                (candidate) => candidate.value === item.targetValue,
              ) || evidenceTargets[0] || null
            : null;
          const patch = createEvidencePayload({
            evidenceId: item.evidenceId,
            maintenanceId,
            deviceId: requestedDeviceId,
            asset: item.asset,
            type: item.type,
            note: item.note,
            projectMode,
            target,
            capturedAt: item.capturedAt,
          });
          return {
            localFileId: item.localFileId,
            localFile: {
              localUri: item.localUri,
              fileName: item.fileName,
              mimeType: item.mimeType,
              fileSize: item.size,
            },
            patch: {
              ...patch,
              Size: item.size,
              size: item.size,
            },
          };
        })
      : [];

    setSaving(true);
    setError('');
    try {
      const result = await saveLocalDeviceWithEvidence(
        db,
        dataScope,
        maintenanceId,
        devicePayload,
        {
          equipmentLocationDraft: (
            locationDraft
            && locationDraft.localId === currentForm.equipmentLocationId
          ) ? locationDraft : null,
          evidence: preparedEvidence,
        },
      );

      savedDraftRef.current = true;
      draftEvidenceRef.current = [];
      setDraftEvidence([]);
      await refreshStatus();
      router.replace({
        pathname: '/maintenance/[maintenanceId]/device/[deviceId]',
        params: {
          maintenanceId,
          deviceId: result.deviceId,
        },
      });
    } catch (saveError) {
      setError(saveError instanceof Error
        ? saveError.message
        : 'No se pudo guardar localmente.');
    } finally {
      setSaving(false);
    }
  }

  function requestDelete() {
    if (!form || !maintenance || !form.id || saving) return;
    if (!canDeleteMaintenanceDevice(permissions, maintenance.Estado)) return;
    const currentDeviceId = form.id;

    Alert.alert(
      'Eliminar dispositivo',
      '¿Eliminar este dispositivo y sus evidencias? El cambio quedará pendiente de sincronización.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            setSaving(true);
            deleteLocalDevice(
              db,
              dataScope,
              maintenanceId,
              currentDeviceId,
            ).then(async () => {
              await refreshStatus();
              router.replace({
                pathname: '/maintenance/[maintenanceId]',
                params: { maintenanceId },
              });
            }).catch((deleteError) => {
              setError(deleteError instanceof Error
                ? deleteError.message
                : 'No se pudo eliminar localmente.');
            }).finally(() => setSaving(false));
          },
        },
      ],
    );
  }

  const clientLocationOptions = optionList(
    catalogs.clientLocations,
    ['UbicacionID', 'ubicacionId', 'id'],
    ['Nombre', 'Ubicacion'],
  );
  const locationNameById = new Map(
    clientLocationOptions.map((item) => [item.value, item.label]),
  );
  const equipmentOptions = ensureOption(
    catalogs.equipment.map((row) => {
      const parentId = first(
        row,
        ['UbicacionID', 'ubicacionId', 'locationId'],
      );
      return {
        value: first(
          row,
          ['UbicacionEquipoID', 'ubicacionEquipoId', 'id'],
        ),
        label: first(
          row,
          ['Nombre', 'UbicacionEquipo', 'zona'],
          'Sin nombre',
        ),
        note: catalogs.clientLocations.length > 1
          ? locationNameById.get(parentId) || ''
          : '',
      };
    }).filter((item) => item.value),
    form.equipmentLocationId,
    form.equipmentLocationName,
  );
  const canCreateLocation = canCreateOperationalClientData(permissions);

  function openLocationCreator() {
    const maintenanceLocationId = first(
      maintenance || undefined,
      ['UbicacionID', 'ubicacionId'],
    );
    setNewLocationParentId(
      maintenanceLocationId
      || clientLocationOptions[0]?.value
      || '',
    );
    setNewLocationName('');
    setNewLocationDescription('');
    setLocationModalOpen(true);
  }

  function acceptLocationDraft() {
    const parentLocationId = String(newLocationParentId || '').trim();
    const name = String(newLocationName || '').trim();
    if (!parentLocationId) {
      setError('Seleccione la ubicación principal.');
      return;
    }
    if (!name) {
      setError('Escriba el nombre de la ubicación del equipo.');
      return;
    }
    const draft: EquipmentLocationDraft = {
      localId: createLocalId('ubicacion-equipo'),
      parentLocationId,
      name,
      description: String(newLocationDescription || '').trim(),
    };
    setLocationDraft(draft);
    patch({
      equipmentLocationId: draft.localId,
      equipmentLocationName: draft.name,
    });
    setLocationModalOpen(false);
    setError('');
  }

  const technicianOptions = optionList(
    catalogs.users,
    ['UsuarioID', 'userId', 'id'],
    ['NombreCompleto', 'Nombre', 'Correo'],
    ['Correo', 'NombreUsuario'],
  );
  const manufacturerOptions = ensureOption(
    optionList(
      manufacturerRows,
      ['FabricanteID', 'id'],
      ['Nombre'],
    ),
    form.manufacturerId,
    form.manufacturerName,
  );
  const modelOptions = ensureOption(
    optionList(
      modelRows,
      ['ModeloID', 'id'],
      ['Nombre'],
    ),
    form.modelId,
    form.modelName,
  );
  const typeValue = form.deviceTypeId || `legacy:${form.category}`;
  const editorDeviceRecord = deviceEditorPayload(
    form,
    maintenanceId,
    questions,
    maintenance.ProyectoChecklistJSON || maintenance.projectChecklist,
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: mode === 'create' ? 'Agregar dispositivo' : 'Editar dispositivo',
        }}
      />
      <View style={styles.screen}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>
              {projectMode ? 'Proyecto' : 'Mantenimiento'}
            </Text>
            <Text style={styles.title}>
              {mode === 'create' ? 'Nuevo dispositivo' : form.name || 'Editar dispositivo'}
            </Text>
            <Text style={styles.subtitle}>
              Los cambios se guardan en SQLite y se sincronizan después.
            </Text>
            {!detailComplete ? (
              <Text style={styles.warningText}>
                El detalle local no está completo. Descárguelo antes de editar dispositivos.
              </Text>
            ) : null}
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Section title="Identificación y ubicación">
            <OptionSheet
              label="Ubicación del equipo *"
              value={form.equipmentLocationId}
              options={equipmentOptions}
              disabled={readOnly}
              placeholder={equipmentOptions.length
                ? 'Seleccione una ubicación'
                : 'Ubicaciones no descargadas'}
              onChange={(selected) => {
                const id = String(selected);
                const option = equipmentOptions.find((item) => item.value === id);
                if (locationDraft?.localId !== id) {
                  setLocationDraft(null);
                }
                patch({
                  equipmentLocationId: id,
                  equipmentLocationName: option?.label || '',
                });
              }}
            />

            {canCreateLocation && !readOnly ? (
              <Pressable
                onPress={openLocationCreator}
                style={styles.inlineAddButton}
              >
                <Text style={styles.inlineAddButtonText}>
                  + Agregar ubicación del equipo
                </Text>
              </Pressable>
            ) : null}

            <OptionSheet
              label="Tipo de dispositivo *"
              value={typeValue}
              options={allowedTypeOptions}
              disabled={readOnly || (mode === 'create' && !selectedCategories.length)}
              placeholder="Seleccione un tipo"
              onChange={(selected) => {
                const selectedValue = String(selected);
                const option = allowedTypeOptions.find((item) => item.value === selectedValue);
                const category = option?.label || form.category;
                const row = catalogs.deviceTypes.find((item) => (
                  first(item, ['TipoDispositivoID', 'id']) === selectedValue
                ));
                patch({
                  deviceTypeId: first(row, ['TipoDispositivoID', 'id']),
                  category,
                  manufacturerId: '',
                  manufacturerName: '',
                  modelId: '',
                  modelName: '',
                  answers: {},
                  questionDetails: [],
                  projectProgress: emptyProjectProgress(),
                });
              }}
            />

            <OptionSheet
              label="Fabricante"
              value={form.manufacturerId}
              options={manufacturerOptions}
              disabled={readOnly || !form.category}
              onChange={(selected) => {
                const id = String(selected);
                const row = manufacturerRows.find((item) => first(item, ['FabricanteID', 'id']) === id);
                patch({
                  manufacturerId: id,
                  manufacturerName: first(row, ['Nombre']),
                  modelId: '',
                  modelName: '',
                });
              }}
            />

            <OptionSheet
              label="Modelo"
              value={form.modelId}
              options={modelOptions}
              disabled={readOnly || !form.manufacturerId}
              onChange={(selected) => {
                const id = String(selected);
                const row = modelRows.find((item) => first(item, ['ModeloID', 'id']) === id);
                patch({ modelId: id, modelName: first(row, ['Nombre']) });
              }}
            />

            <Field
              label="Nombre / identificador *"
              value={form.name}
              disabled={readOnly}
              onChange={(name) => patch({ name })}
            />
            <Field
              label="Serie"
              value={form.serial}
              disabled={readOnly}
              onChange={(serial) => patch({ serial })}
            />
            <Field
              label="Dirección MAC"
              value={form.macAddress}
              disabled={readOnly}
              placeholder="AA:BB:CC:DD:EE:FF"
              onChange={(macAddress) => patch({
                macAddress: formatMacAddressInput(macAddress),
              })}
            />
          </Section>

          <Section title="Fecha y grupo de trabajo">
            <NativeDateField
              label="Fecha de trabajo"
              value={form.workDate}
              disabled={readOnly}
              onChange={(workDate) => patch({ workDate })}
            />

            <OptionSheet
              label="Técnicos"
              values={form.technicianIds}
              options={technicianOptions}
              multiple
              disabled={readOnly}
              onChange={(selected) => patch({
                technicianIds: Array.isArray(selected) ? selected : [String(selected)],
              })}
            />
          </Section>

          {!projectMode ? (
            <Section title="Checklist">
              {form.status === 'PENDIENTE' ? (
                <View style={styles.pendingBox}>
                  <Text style={styles.pendingTitle}>Pendiente manual</Text>
                  <Text style={styles.pendingText}>
                    Las pruebas quedan bloqueadas hasta quitar esta marca.
                  </Text>
                  <Pressable
                    disabled={readOnly}
                    onPress={() => patch({ status: 'Pendiente' })}
                    style={styles.unlockButton}
                  >
                    <Text style={styles.unlockText}>Quitar pendiente manual</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  <ChoiceField
                    label="¿El dispositivo está funcionando correctamente?"
                    value={form.functionality}
                    options={['Sí', 'No']}
                    disabled={readOnly}
                    onChange={(functionality) => patch({ functionality })}
                  />
                  <ChoiceField
                    label="¿El dispositivo está en uso?"
                    value={form.inUse}
                    options={['Sí, en uso', 'No, está guardado', 'No']}
                    disabled={readOnly}
                    onChange={(inUse) => patch({ inUse })}
                  />

                  {questions.map((question) => (
                    <View key={question.questionId || question.key}>
                      <DynamicQuestionField
                        question={question}
                        value={form.answers[question.key] ?? question.value ?? ''}
                        disabled={readOnly || Boolean(question.historical)}
                        catalogs={catalogs}
                        allQuestions={catalogs.questions}
                        onChange={(value) => patch({
                          answers: {
                            ...form.answers,
                            [question.key]: value,
                          },
                        })}
                      />
                      {question.historical ? (
                        <Text style={styles.historicalNote}>
                          Pregunta histórica: ya no está activa en el catálogo.
                        </Text>
                      ) : null}
                    </View>
                  ))}

                  <ChoiceField
                    label="Estado"
                    value={completion.complete ? form.status : ''}
                    options={['Correcto', 'Mal estado']}
                    disabled={readOnly || !completion.complete}
                    onChange={(status) => patch({ status })}
                  />
                  {!completion.complete ? (
                    <Text style={styles.hint}>
                      Estado pendiente automático: faltan {completion.missing.length} respuesta{completion.missing.length === 1 ? '' : 's'}.
                    </Text>
                  ) : null}

                  <Pressable
                    disabled={readOnly}
                    onPress={() => patch({ status: 'PENDIENTE' })}
                    style={styles.manualPendingButton}
                  >
                    <Text style={styles.manualPendingText}>Marcar pendiente manual</Text>
                  </Pressable>
                </>
              )}
            </Section>
          ) : (
            <>
              <Section title="Campos del proyecto">
                {questions.length ? questions.map((question) => (
                  <View key={question.questionId || question.key}>
                    <DynamicQuestionField
                      question={question}
                      value={form.answers[question.key] ?? question.value ?? ''}
                      disabled={readOnly || Boolean(question.historical)}
                      catalogs={catalogs}
                      allQuestions={catalogs.questions}
                      onChange={(value) => patch({
                        answers: {
                          ...form.answers,
                          [question.key]: value,
                        },
                      })}
                    />
                  </View>
                )) : (
                  <Text style={styles.hint}>
                    Este tipo no tiene campos de Proyecto configurados.
                  </Text>
                )}
              </Section>

              <ProjectProgressEditor
                checklist={maintenance.ProyectoChecklistJSON || maintenance.projectChecklist}
                device={form}
                disabled={readOnly}
                onChange={(projectProgress) => patch({ projectProgress })}
              />
            </>
          )}

          <Section title="Observaciones">
            <Field
              label="Observación"
              value={form.observation}
              disabled={readOnly}
              multiline
              onChange={(observation) => patch({ observation })}
            />
          </Section>

          {mode === 'create' ? (
            <MaintenanceEvidenceDraftSection
              maintenanceType={maintenanceType}
              device={editorDeviceRecord}
              items={draftEvidence}
              onChange={setDraftEvidence}
              disabled={readOnly || saving}
            />
          ) : (
            <View style={styles.stageNotice}>
              <Text style={styles.stageNoticeTitle}>Evidencias</Text>
              <Text style={styles.stageNoticeText}>
                Las evidencias existentes continúan disponibles desde el detalle del dispositivo.
              </Text>
              {form.id ? (
                <Pressable
                  disabled={saving}
                  onPress={() => router.push({
                    pathname: '/maintenance/[maintenanceId]/device/[deviceId]',
                    params: {
                      maintenanceId,
                      deviceId: form.id,
                    },
                  })}
                  style={styles.evidenceButton}
                >
                  <Text style={styles.evidenceButtonText}>Gestionar evidencias</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </ScrollView>

        {!readOnly ? (
          <View style={styles.footer}>
            {mode === 'edit' && canDeleteMaintenanceDevice(permissions, maintenance.Estado) ? (
              <Pressable
                onPress={requestDelete}
                disabled={saving}
                style={styles.deleteButton}
              >
                <Text style={styles.deleteText}>Eliminar</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => router.back()}
                disabled={saving}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Cancelar</Text>
              </Pressable>
            )}
            <Pressable
              onPress={save}
              disabled={saving || !detailComplete}
              style={[
                styles.primaryButton,
                (saving || !detailComplete) && styles.disabled,
              ]}
            >
              {saving ? <ActivityIndicator color="#fff" /> : null}
              <Text style={styles.primaryButtonText}>
                {saving ? 'Guardando…' : 'Guardar localmente'}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <Modal
        visible={locationModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setLocationModalOpen(false)}
      >
        <View style={styles.modalScreen}>
          <View style={styles.modalHeader}>
            <Pressable
              onPress={() => setLocationModalOpen(false)}
              style={styles.modalHeaderAction}
            >
              <Text style={styles.modalCancelText}>Cancelar</Text>
            </Pressable>
            <Text style={styles.modalTitle}>Nueva ubicación del equipo</Text>
            <Pressable
              onPress={acceptLocationDraft}
              style={styles.modalHeaderAction}
            >
              <Text style={styles.modalSaveText}>Agregar</Text>
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.modalContent}
          >
            <Text style={styles.modalHelp}>
              Igual que en la web, esta ubicación pertenece a una ubicación principal del cliente.
              Se creará en el servidor cuando corresponda sincronizar.
            </Text>

            <OptionSheet
              label="Ubicación principal *"
              value={newLocationParentId}
              options={clientLocationOptions}
              onChange={(value) => setNewLocationParentId(String(value))}
            />

            <Field
              label="Nombre *"
              value={newLocationName}
              onChange={setNewLocationName}
              placeholder="Ej. Piso 2 · Cuarto de servidores"
            />

            <Field
              label="Descripción"
              value={newLocationDescription}
              onChange={setNewLocationDescription}
              multiline
              placeholder="Detalle opcional"
            />
          </ScrollView>
        </View>
      </Modal>
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
  placeholder = '',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  multiline?: boolean;
  placeholder?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        editable={!disabled}
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        placeholder={placeholder}
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

function ChoiceField({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.choiceRow}>
        {options.map((option) => (
          <Pressable
            key={option}
            disabled={disabled}
            onPress={() => onChange(option)}
            style={[
              styles.choice,
              value === option && styles.choiceSelected,
              disabled && styles.disabled,
            ]}
          >
            <Text style={[
              styles.choiceText,
              value === option && styles.choiceTextSelected,
            ]}>
              {option}
            </Text>
          </Pressable>
        ))}
      </View>
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
  warningText: {
    color: colors.warning,
    fontWeight: '800',
    fontSize: 11,
    marginTop: spacing.xs,
  },
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
  field: { gap: 6 },
  fieldLabel: { color: colors.text, fontWeight: '800', fontSize: 12 },
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
    minHeight: 100,
    paddingTop: spacing.sm,
    textAlignVertical: 'top',
  },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  choice: {
    minHeight: 42,
    paddingHorizontal: spacing.sm,
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
  pendingBox: {
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.warningSoft,
    gap: 4,
  },
  pendingTitle: { color: colors.warning, fontWeight: '900' },
  pendingText: { color: colors.text, fontSize: 11, lineHeight: 17 },
  unlockButton: {
    alignSelf: 'flex-start',
    minHeight: 38,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unlockText: { color: colors.primary, fontWeight: '900', fontSize: 11 },
  manualPendingButton: {
    minHeight: 42,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.warning,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualPendingText: { color: colors.warning, fontWeight: '900', fontSize: 11 },
  hint: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  historicalNote: {
    color: colors.muted,
    fontSize: 9,
    marginTop: 3,
    fontStyle: 'italic',
  },
  stageNotice: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceHigh,
    gap: 3,
  },
  stageNoticeTitle: { color: colors.text, fontWeight: '900' },
  stageNoticeText: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  evidenceButton: {
    minHeight: sizing.touchTargetMin,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  evidenceButtonText: {
    color: colors.primary,
    fontWeight: '900',
    fontSize: 11,
  },
  inlineAddButton: {
    alignSelf: 'flex-start',
    minHeight: sizing.touchTargetMin,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineAddButtonText: {
    color: colors.primary,
    fontWeight: '900',
    fontSize: 11,
  },
  modalScreen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  modalHeader: {
    minHeight: 58,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outlineSoft,
    backgroundColor: colors.surfaceCard,
  },
  modalHeaderAction: {
    width: 76,
    minHeight: sizing.touchTargetMin,
    justifyContent: 'center',
  },
  modalCancelText: {
    color: colors.muted,
    fontWeight: '800',
  },
  modalTitle: {
    flex: 1,
    color: colors.text,
    textAlign: 'center',
    fontWeight: '900',
    fontSize: 15,
  },
  modalSaveText: {
    color: colors.primary,
    textAlign: 'right',
    fontWeight: '900',
  },
  modalContent: {
    padding: spacing.md,
    gap: spacing.md,
  },
  modalHelp: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 17,
  },
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
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    backgroundColor: colors.surfaceCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: { color: colors.text, fontWeight: '800' },
  deleteButton: {
    flex: 1,
    minHeight: sizing.buttonHeight,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: { color: colors.danger, fontWeight: '900' },
  disabled: { opacity: 0.48 },
});

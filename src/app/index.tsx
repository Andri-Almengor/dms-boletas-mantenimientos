import { useAuth } from '@/auth/AuthProvider';
import { MaintenanceCard } from '@/components/maintenance/MaintenanceCard';
import { MaintenanceFilterModal } from '@/components/maintenance/MaintenanceFilterModal';
import { SyncStatusCard } from '@/components/SyncStatusCard';
import {
  MAINTENANCE_LIST_PAGE_SIZE,
  MaintenanceListFilters,
  MaintenanceStatus,
  maintenanceRecordId,
} from '@/features/maintenance/maintenanceListDomain';
import {
  listLocalMaintenanceClients,
  listLocalMaintenancesPage,
} from '@/db/maintenanceRepository';
import { useSync } from '@/sync/SyncProvider';
import { colors, radius, sizing, spacing } from '@/theme/tokens';
import { Redirect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const EMPTY_FILTERS: MaintenanceListFilters = {
  client: '',
  dateFrom: '',
  dateTo: '',
};

function mergeUnique(
  current: Record<string, unknown>[],
  incoming: Record<string, unknown>[],
) {
  const map = new Map(
    current.map((item) => [maintenanceRecordId(item), item]),
  );
  for (const item of incoming) {
    map.set(maintenanceRecordId(item), item);
  }
  return [...map.values()];
}

export default function MaintenanceListScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const {
    user,
    loading: authLoading,
    dataScope,
    logout,
  } = useAuth();
  const {
    syncNow,
    lastSuccessAt,
    syncing,
  } = useSync();

  const [status, setStatus] = useState<MaintenanceStatus>('PENDIENTE');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [filters, setFilters] = useState<MaintenanceListFilters>(EMPTY_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [clients, setClients] = useState<string[]>([]);
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const activeFilters = useMemo(
    () => Object.values(filters).filter(Boolean).length,
    [filters],
  );

  const loadPage = useCallback(async (
    nextPage: number,
    reset = false,
  ) => {
    if (!dataScope) return;
    reset ? setLoading(true) : setLoadingMore(true);
    setError('');
    try {
      const result = await listLocalMaintenancesPage(db, {
        scopeKey: dataScope,
        status,
        search: appliedSearch,
        filters,
        page: nextPage,
        pageSize: MAINTENANCE_LIST_PAGE_SIZE,
      });
      setItems((current) => reset
        ? result.items
        : mergeUnique(current, result.items));
      setTotal(result.total);
      setPage(result.page);
      setHasMore(result.hasMore);
    } catch (loadError) {
      setError(loadError instanceof Error
        ? loadError.message
        : 'No se pudieron leer los mantenimientos locales.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [db, dataScope, status, appliedSearch, filters]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedSearch(search.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!dataScope) return;
    loadPage(1, true).catch(() => undefined);
  }, [dataScope, status, appliedSearch, filters, lastSuccessAt, loadPage]);

  useEffect(() => {
    if (!dataScope) return;
    listLocalMaintenanceClients(db, dataScope)
      .then(setClients)
      .catch(() => setClients([]));
  }, [db, dataScope, lastSuccessAt]);

  if (authLoading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (!user) return <Redirect href="/login" />;
  if (user.CambioPasswordObligatorio) return <Redirect href="/change-password" />;

  function openMaintenance(maintenanceId: string) {
    Keyboard.dismiss();
    router.push({
      pathname: '/maintenance/[maintenanceId]',
      params: { maintenanceId },
    });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <FlatList
        data={items}
        keyExtractor={(item, index) => maintenanceRecordId(item, `maintenance-${index}`)}
        renderItem={({ item }) => (
          <MaintenanceCard item={item} onPress={openMaintenance} />
        )}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.listContent,
          !items.length && styles.emptyListContent,
        ]}
        ListHeaderComponent={(
          <View style={styles.headerContent}>
            <View style={styles.heading}>
              <View style={styles.headingText}>
                <Text style={styles.eyebrow}>Gestión técnica</Text>
                <Text style={styles.title}>Mantenimientos</Text>
                <Text style={styles.subtitle}>
                  La lista y los filtros trabajan directamente sobre SQLite.
                </Text>
              </View>
              <Pressable
                onPress={logout}
                style={({ pressed }) => [
                  styles.logoutButton,
                  pressed && styles.logoutPressed,
                ]}
              >
                <Text style={styles.logoutText}>Salir</Text>
              </Pressable>
            </View>

            <View style={styles.syncWrap}>
              <SyncStatusCard />
            </View>

            <View style={styles.tabs}>
              {(['PENDIENTE', 'FINALIZADO'] as MaintenanceStatus[]).map((value) => (
                <Pressable
                  key={value}
                  onPress={() => setStatus(value)}
                  style={[
                    styles.tab,
                    status === value && styles.tabActive,
                  ]}
                >
                  <Text style={[
                    styles.tabText,
                    status === value && styles.tabTextActive,
                  ]}>
                    {value === 'PENDIENTE' ? 'Pendientes' : 'Finalizados'}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.searchRow}>
              <Text style={styles.searchGlyph}>⌕</Text>
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Buscar título, cliente o responsable..."
                placeholderTextColor={colors.muted}
                style={styles.searchInput}
                returnKeyType="search"
                autoCorrect={false}
              />
              {search ? (
                <Pressable
                  onPress={() => setSearch('')}
                  hitSlop={10}
                  style={styles.iconButton}
                >
                  <Text style={styles.iconButtonText}>×</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => setFilterOpen(true)}
                style={[
                  styles.filterButton,
                  activeFilters > 0 && styles.filterButtonActive,
                ]}
              >
                <Text style={[
                  styles.filterText,
                  activeFilters > 0 && styles.filterTextActive,
                ]}>
                  Filtros{activeFilters ? ` · ${activeFilters}` : ''}
                </Text>
              </Pressable>
            </View>

            <View style={styles.resultsRow}>
              <Text style={styles.resultsText}>
                {loading
                  ? 'Leyendo SQLite…'
                  : `${items.length}${total > items.length ? ` de ${total}` : ''} mantenimiento${total === 1 ? '' : 's'}`}
              </Text>
              <Pressable
                onPress={() => loadPage(1, true)}
                disabled={loading}
                hitSlop={10}
              >
                <Text style={styles.localRefresh}>
                  {loading ? '…' : 'Actualizar vista'}
                </Text>
              </Pressable>
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
          </View>
        )}
        ListEmptyComponent={!loading ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>▣</Text>
            <Text style={styles.emptyTitle}>
              {status === 'PENDIENTE'
                ? 'Sin mantenimientos pendientes'
                : 'Sin mantenimientos finalizados'}
            </Text>
            <Text style={styles.emptyText}>
              {appliedSearch || activeFilters
                ? 'No hay registros locales con los filtros actuales.'
                : 'Si este dispositivo todavía no tiene la base operativa, sincronice una vez con conexión.'}
            </Text>
            {!appliedSearch && !activeFilters ? (
              <Pressable
                style={styles.primaryButton}
                onPress={syncNow}
                disabled={syncing}
              >
                {syncing ? <ActivityIndicator color="#fff" /> : null}
                <Text style={styles.primaryButtonText}>
                  {syncing ? 'Sincronizando…' : 'Sincronizar ahora'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        ListFooterComponent={loadingMore ? (
          <View style={styles.footerLoading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : null}
        onEndReached={() => {
          if (hasMore && !loading && !loadingMore) {
            loadPage(page + 1, false).catch(() => undefined);
          }
        }}
        onEndReachedThreshold={0.35}
      />

      <MaintenanceFilterModal
        visible={filterOpen}
        filters={filters}
        clients={clients}
        onClose={() => setFilterOpen(false)}
        onApply={(next) => {
          setFilters(next);
          setFilterOpen(false);
        }}
        onClear={() => {
          setFilters(EMPTY_FILTERS);
          setFilterOpen(false);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  loadingScreen: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: { paddingBottom: spacing.xl },
  emptyListContent: { flexGrow: 1 },
  headerContent: { gap: spacing.md, paddingBottom: spacing.sm },
  heading: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  headingText: { flex: 1 },
  eyebrow: {
    color: colors.primary,
    fontWeight: '900',
    textTransform: 'uppercase',
    fontSize: 11,
    letterSpacing: 0.6,
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '900',
    marginTop: spacing.xxs,
  },
  subtitle: { color: colors.muted, lineHeight: 19, marginTop: spacing.xxs, fontSize: 13 },
  logoutButton: {
    minHeight: sizing.touchTargetMin,
    paddingHorizontal: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    backgroundColor: colors.surfaceCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutPressed: { opacity: 0.72 },
  logoutText: { color: colors.muted, fontWeight: '800', fontSize: 12 },
  syncWrap: { paddingHorizontal: spacing.md },
  tabs: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  tab: {
    minHeight: sizing.touchTargetMin,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceCard,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { color: colors.muted, fontWeight: '800' },
  tabTextActive: { color: '#fff' },
  searchRow: {
    marginHorizontal: spacing.md,
    minHeight: sizing.controlHeight,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  searchGlyph: { color: colors.primary, fontSize: 24 },
  searchInput: { flex: 1, color: colors.text, fontSize: 14, minWidth: 0 },
  iconButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonText: { color: colors.muted, fontSize: 24 },
  filterButton: {
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    borderRadius: 999,
    backgroundColor: colors.surfaceLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterButtonActive: { backgroundColor: colors.primarySoft },
  filterText: { color: colors.muted, fontSize: 11, fontWeight: '800' },
  filterTextActive: { color: colors.primary },
  resultsRow: {
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resultsText: { color: colors.muted, fontSize: 12 },
  localRefresh: { color: colors.primary, fontWeight: '800', fontSize: 12 },
  errorBox: {
    marginHorizontal: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.dangerSoft,
  },
  errorText: { color: colors.danger, fontWeight: '700', fontSize: 12 },
  emptyState: {
    margin: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineSoft,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyIcon: { color: colors.primary, fontSize: 34 },
  emptyTitle: { color: colors.text, fontWeight: '900', fontSize: 18, textAlign: 'center' },
  emptyText: { color: colors.muted, textAlign: 'center', lineHeight: 20 },
  primaryButton: {
    minHeight: sizing.buttonHeight,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  primaryButtonText: { color: '#fff', fontWeight: '900' },
  footerLoading: { padding: spacing.lg, alignItems: 'center' },
});

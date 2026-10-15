import {
  MaintenanceLocalProgress,
  MaintenanceProgressRow,
} from '@/features/maintenance/maintenanceProgress';
import { colors, radius, spacing } from '@/theme/tokens';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  progress: MaintenanceLocalProgress;
  detailComplete: boolean;
  projectMode: boolean;
};

function EvidenceBreakdown({
  item,
  projectMode,
}: {
  item: MaintenanceProgressRow;
  projectMode: boolean;
}) {
  return (
    <View style={styles.breakdown}>
      <Text style={styles.breakdownText}>
        {item.withEvidence} con evidencia · {item.missingEvidence} sin evidencia
        · {item.evidenceTotal} archivo{item.evidenceTotal === 1 ? '' : 's'}
      </Text>
      {!projectMode ? (
        <Text style={styles.breakdownText}>
          {item.completeEvidencePairs} con ANTES y DESPUÉS
          · {item.pendingAfter} solo ANTES (falta DESPUÉS)
          {item.onlyAfter ? ` · ${item.onlyAfter} solo DESPUÉS` : ''}
          {item.unclassifiedOnly ? ` · ${item.unclassifiedOnly} sin clasificar` : ''}
        </Text>
      ) : null}
    </View>
  );
}

export function MaintenanceProgressSummary({
  progress,
  detailComplete,
  projectMode,
}: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>Avance del mantenimiento</Text>
      {!detailComplete ? (
        <Text style={styles.notice}>
          El detalle no está descargado. Los datos registrados y las evidencias
          aparecerán cuando el contenido esté disponible en este teléfono.
        </Text>
      ) : null}

      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.number}>{progress.expected || '0'}</Text>
          <Text style={styles.statLabel}>Esperados</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.number}>
            {detailComplete ? progress.registered : '—'}
          </Text>
          <Text style={styles.statLabel}>Registrados</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.number}>
            {detailComplete ? progress.evidenceTotal : '—'}
          </Text>
          <Text style={styles.statLabel}>Evidencias</Text>
        </View>
      </View>

      {detailComplete && progress.expected > 0 ? (
        <>
          <View style={styles.progressHeading}>
            <Text style={styles.muted}>Avance del inventario</Text>
            <Text style={styles.percent}>{progress.percentage}%</Text>
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${progress.percentage}%` as `${number}%` }]} />
          </View>
          <Text style={styles.muted}>
            {progress.remaining
              ? `Faltan ${progress.remaining} dispositivos por registrar, según lo previsto por tipo.`
              : progress.inventoryComplete
                ? 'Todos los tipos planificados alcanzaron su cantidad.'
                : 'Sin cantidades esperadas completas.'}
          </Text>
        </>
      ) : null}

      <Text style={styles.heading}>Dispositivos por tipo</Text>
      {progress.items.length ? progress.items.map((item) => (
        <View key={item.key} style={styles.typeRow}>
          <View style={styles.typeHeader}>
            <Text style={styles.typeName}>{item.label}</Text>
            <Text style={styles.typeCount}>
              {detailComplete ? item.registered : '—'} / {item.expected}
            </Text>
          </View>
          {item.expected === 0 ? (
            <Text style={styles.muted}>Sin cantidad planificada para este tipo</Text>
          ) : detailComplete && item.remaining > 0 ? (
            <Text style={styles.muted}>
              Faltan {item.remaining} por agregar
            </Text>
          ) : null}
          {detailComplete && progress.inventoryComplete ? (
            <EvidenceBreakdown item={item} projectMode={projectMode} />
          ) : null}
        </View>
      )) : (
        <Text style={styles.muted}>
          No hay cantidades planificadas por tipo en el detalle local.
        </Text>
      )}

      {detailComplete && progress.inventoryComplete ? (
        <View style={styles.totals}>
          <Text style={styles.totalsTitle}>Resumen de evidencias</Text>
          <Text style={styles.breakdownText}>
            {progress.withEvidence} dispositivos con evidencia;
            {' '}{progress.missingEvidence} sin evidencia.
          </Text>
          {!projectMode ? (
            <Text style={styles.breakdownText}>
              {progress.pendingAfter} tienen ANTES pero les falta DESPUÉS;
              {' '}{progress.completeEvidencePairs} tienen ambas.
              {progress.onlyAfter
                ? ` ${progress.onlyAfter} tienen solo DESPUÉS.` : ''}
              {progress.unclassifiedOnly
                ? ` ${progress.unclassifiedOnly} tienen evidencia sin clasificar.` : ''}
            </Text>
          ) : (
            <Text style={styles.muted}>
              En Proyecto las evidencias no se clasifican como ANTES/DESPUÉS.
              El checklist se registra por separado.
            </Text>
          )}
        </View>
      ) : null}
      <Text style={styles.footnote}>
        Conteo local de registros y evidencias. No equivale a la finalización
        del checklist ni altera el estado autorizado en el servidor.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    gap: spacing.sm,
  },
  eyebrow: { color: colors.primary, fontSize: 12, fontWeight: '900' },
  stats: { flexDirection: 'row', gap: spacing.xs },
  stat: {
    flex: 1, backgroundColor: colors.surfaceLow, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center', padding: spacing.sm,
  },
  number: { fontSize: 22, color: colors.text, fontWeight: '900' },
  statLabel: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  heading: { fontWeight: '900', color: colors.text, fontSize: 15, marginTop: spacing.xs },
  typeRow: {
    backgroundColor: colors.surfaceLow, borderRadius: radius.sm,
    padding: spacing.sm, gap: spacing.xs,
  },
  typeHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  typeName: { color: colors.text, fontWeight: '800', flex: 1 },
  typeCount: { color: colors.primary, fontWeight: '900' },
  breakdown: { gap: 4, borderTopWidth: 1, borderTopColor: colors.outlineSoft, paddingTop: spacing.xs },
  breakdownText: { color: colors.text, fontSize: 12, lineHeight: 19 },
  muted: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  notice: {
    padding: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.warningSoft,
    color: colors.text, fontSize: 12, lineHeight: 18,
  },
  progressHeading: { flexDirection: 'row', justifyContent: 'space-between' },
  percent: { color: colors.primary, fontWeight: '900' },
  track: { height: 8, backgroundColor: colors.surfaceHigh, borderRadius: 10, overflow: 'hidden' },
  fill: { height: 8, backgroundColor: colors.primary, borderRadius: 10 },
  totals: { padding: spacing.sm, backgroundColor: colors.primarySoft, borderRadius: radius.sm, gap: spacing.xs },
  totalsTitle: { color: colors.primary, fontWeight: '900' },
  footnote: { color: colors.muted, fontSize: 11, lineHeight: 16 },
});

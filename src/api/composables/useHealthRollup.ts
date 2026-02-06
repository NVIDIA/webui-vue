/**
 * useHealthRollup - Vue Query composable for Health Rollup status
 *
 * Implements the nvbmc health fallback chain:
 * 1. System.Status.HealthRollup (native Redfish)
 * 2. MetricReports/*HealthMetrics* (calculated worst-case from HealthRollup MetricValues)
 * 3. EventLogs severity rollup (calculated from unresolved Critical/Warning events)
 * 4. 'Unknown' (no data available)
 *
 * Uses useHealthMetrics for MetricReports data (shared fetch for the tooltip grid).
 * Follows Redfish-first naming conventions.
 */
import { computed, type ComputedRef } from 'vue';
import { storeToRefs } from 'pinia';
import { useGlobalStore } from '@/stores/global';
import { useEventLog } from './useEventLog';
import { useHealthMetrics } from './useHealthMetrics';
import { ResourceHealth } from '@/api/model/ResourceHealth';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate worst-case health from an array of health values.
 * Priority: Critical > Warning > OK
 */
function calculateWorstCaseHealth(Values: string[]): ResourceHealth {
  if (Values.includes(ResourceHealth.Critical)) return ResourceHealth.Critical;
  if (Values.includes(ResourceHealth.Warning)) return ResourceHealth.Warning;
  return ResourceHealth.OK;
}

// ============================================================================
// Composable
// ============================================================================

export interface UseHealthRollupReturn {
  /** Overall health rollup status */
  HealthRollup: ComputedRef<ResourceHealth | 'Unknown'>;
  /** Loading state */
  isLoading: ComputedRef<boolean>;
  /** Error state */
  isError: ComputedRef<boolean>;
  /** Error details */
  error: ComputedRef<Error | null>;
  /** Data source used for health (for debugging) */
  DataSource: ComputedRef<'System' | 'MetricReports' | 'EventLog' | 'Unknown'>;
}

export function useHealthRollup(): UseHealthRollupReturn {
  // -------------------------------------------------------------------------
  // Data Sources
  // -------------------------------------------------------------------------

  // Source 1: System.Status.HealthRollup from global store
  const globalStore = useGlobalStore();
  const { ManagedSystem, isLoading: SystemLoading } = storeToRefs(globalStore);

  // Extract HealthRollup from System.Status
  const SystemHealthRollup = computed(() => {
    const Status = ManagedSystem.value?.Status as
      | { Health?: string; HealthRollup?: string }
      | undefined;
    return Status?.HealthRollup as ResourceHealth | undefined;
  });

  // Source 2: MetricReports via useHealthMetrics (shared fetch for tooltip grid)
  // useHealthMetrics always fetches when System is loaded - we just consume its data
  const { ComponentHealth, isLoading: MetricsLoading, isError: MetricsError } =
    useHealthMetrics();

  // Extract HealthRollup values from ComponentHealth for worst-case calculation
  const MetricHealthValues = computed<string[]>(() => {
    // Don't use MetricReports for rollup calculation if System has HealthRollup
    // (But useHealthMetrics still fetches for the tooltip grid display)
    if (SystemHealthRollup.value) return [];

    return ComponentHealth.value
      .map((C) => C.HealthRollup)
      .filter((H) => H !== '-' && H !== '');
  });

  // Source 3: EventLog health status (always available as final fallback)
  const { healthStatus: EventLogHealth, isLoading: EventLogLoading } =
    useEventLog();

  // -------------------------------------------------------------------------
  // Computed: Final Health Rollup with Fallback Chain
  // -------------------------------------------------------------------------

  const HealthRollup = computed<ResourceHealth | 'Unknown'>(() => {
    // Priority 1: System.Status.HealthRollup (native Redfish)
    if (SystemHealthRollup.value) {
      return SystemHealthRollup.value;
    }

    // Priority 2: MetricReports HealthRollup (worst-case calculation)
    if (MetricHealthValues.value.length > 0) {
      return calculateWorstCaseHealth(MetricHealthValues.value);
    }

    // Priority 3: EventLog severity rollup
    if (EventLogHealth.value && EventLogHealth.value !== '') {
      return EventLogHealth.value as ResourceHealth;
    }

    // Priority 4: Unknown
    return 'Unknown';
  });

  const DataSource = computed<'System' | 'MetricReports' | 'EventLog' | 'Unknown'>(() => {
    if (SystemHealthRollup.value) return 'System';
    if (MetricHealthValues.value.length > 0) return 'MetricReports';
    if (EventLogHealth.value && EventLogHealth.value !== '') return 'EventLog';
    return 'Unknown';
  });

  const isLoading = computed(
    () => SystemLoading.value || MetricsLoading.value || EventLogLoading.value,
  );

  const isError = computed(() => MetricsError.value);

  const error = computed(() => null as Error | null);

  // -------------------------------------------------------------------------
  // Return
  // -------------------------------------------------------------------------

  return {
    HealthRollup,
    isLoading,
    isError,
    error,
    DataSource,
  };
}

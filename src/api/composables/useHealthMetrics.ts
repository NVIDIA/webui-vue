/**
 * useHealthMetrics - Vue Query composable for per-component Health Metrics
 *
 * Fetches detailed health metrics from TelemetryService MetricReports
 * for display in the HealthRollupIcon tooltip grid.
 *
 * Strategy:
 * 1. Fetch MetricReports collection listing (no $expand)
 * 2. Find the HealthMetrics report URI (contains "HealthMetrics")
 * 3. Fetch just that one report directly
 *
 * This avoids issues with BMCs that have broken $expand or 404 members.
 *
 * Follows Redfish-first naming conventions.
 */
import { computed, type ComputedRef } from 'vue';
import { storeToRefs } from 'pinia';
import { useQuery } from '@tanstack/vue-query';
import { useGlobalStore } from '@/stores/global';
import { useGetTelemetryServiceMetricReports } from '@/api/endpoints/redfish.gen';
import { apiInstance } from '@/api/mutator/axios-instance';
import { ResourceHealth } from '@/api/model/ResourceHealth';
import type { MetricReport } from '@/api/model/MetricReport';

// ============================================================================
// Types
// ============================================================================

/**
 * Parsed component health entry for tooltip display
 */
export interface ComponentHealthEntry {
  /** Display name (e.g., "GPU 0", "CPU 1", "Baseboard 0") */
  Name: string;
  /** Raw component key for sorting */
  ComponentKey: string;
  /** Component Health status */
  Health: string;
  /** Component HealthRollup status */
  HealthRollup: string;
  /** Redfish URI to the component resource */
  URI: string;
}
// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract the Redfish URI from MetricProperty by terminating at '#'.
 *
 * Examples:
 * - /redfish/v1/Chassis/HGX_GPU_0#/Status/Health -> "/redfish/v1/Chassis/HGX_GPU_0"
 * - /redfish/v1/Systems/HGX_Baseboard_0#/Status/HealthRollup -> "/redfish/v1/Systems/HGX_Baseboard_0"
 */
function extractResourceURI(MetricProperty: string): string {
  const HashIndex = MetricProperty.indexOf('#');
  if (HashIndex !== -1) {
    return MetricProperty.substring(0, HashIndex);
  }
  return MetricProperty;
}

/**
 * Extract component name from MetricProperty path.
 *
 * Examples:
 * - /redfish/v1/Chassis/HGX_GPU_0#/Status/Health -> "HGX_GPU_0"
 * - /redfish/v1/Systems/HGX_Baseboard_0#/Status/HealthRollup -> "HGX_Baseboard_0"
 */
function extractComponentName(MetricProperty: string): string {
  const Segments = MetricProperty.split('/');

  // Look for segment with '#' which contains the component name
  for (const Segment of Segments) {
    if (Segment.includes('#')) {
      return Segment.split('#')[0];
    }
  }

  // Also check for Chassis/HGX_GPU_0 or Systems/HGX_Baseboard_0 pattern
  for (let i = 0; i < Segments.length; i++) {
    const Segment = Segments[i];
    if (
      (Segment === 'Chassis' || Segment === 'Systems') &&
      i + 1 < Segments.length
    ) {
      const NextSegment = Segments[i + 1];
      if (
        NextSegment.includes('GPU') ||
        NextSegment.includes('CPU') ||
        NextSegment.includes('Baseboard') ||
        NextSegment.includes('ProcessorModule')
      ) {
        return NextSegment.split('#')[0];
      }
    }
  }

  return 'System';
}

/**
 * Format component name for display.
 * Removes prefix and replaces underscores with spaces.
 *
 * Examples:
 * - "HGX_GPU_0" -> "GPU 0"
 * - "HGX_Baseboard_0" -> "Baseboard 0"
 */
function formatComponentName(ComponentKey: string): string {
  return ComponentKey.replace(/^[A-Z]+_/, '').replace(/_/g, ' ') || 'System';
}

/**
 * Get sort priority for component type.
 * Lower number = higher priority (appears first).
 * Order: GPU, CPU, Module, Baseboard
 */
function getComponentPriority(Key: string): number {
  if (Key.includes('GPU')) return 0;
  if (Key.includes('CPU')) return 1;
  if (Key.includes('ProcessorModule') || Key.includes('Module')) return 2;
  if (Key.includes('Baseboard')) return 3;
  return 99; // Others at the end
}

/**
 * Sort components: GPUs first, then CPUs, Modules, Baseboard, then alphabetically
 */
function sortComponents(A: ComponentHealthEntry, B: ComponentHealthEntry): number {
  const AKey = A.ComponentKey;
  const BKey = B.ComponentKey;

  const APriority = getComponentPriority(AKey);
  const BPriority = getComponentPriority(BKey);

  // Sort by priority first
  if (APriority !== BPriority) {
    return APriority - BPriority;
  }

  // Same type: sort numerically by trailing number
  const ANum = parseInt(AKey.match(/\d+$/)?.[0] ?? '0', 10);
  const BNum = parseInt(BKey.match(/\d+$/)?.[0] ?? '0', 10);

  if (ANum !== BNum) {
    return ANum - BNum;
  }

  // Fallback: alphabetical
  return AKey.localeCompare(BKey);
}

// ============================================================================
// Composable
// ============================================================================

export interface UseHealthMetricsReturn {
  /** Per-component health entries for tooltip display */
  ComponentHealth: ComputedRef<ComponentHealthEntry[]>;
  /** Loading state */
  isLoading: ComputedRef<boolean>;
  /** Error state */
  isError: ComputedRef<boolean>;
  /** Whether health metrics are available */
  hasMetrics: ComputedRef<boolean>;
}

export function useHealthMetrics(): UseHealthMetricsReturn {
  const globalStore = useGlobalStore();
  const { ManagedSystemURI, isLoading: SystemLoading } = storeToRefs(globalStore);

  // -------------------------------------------------------------------------
  // Step 1: Fetch MetricReports collection listing (no $expand)
  // -------------------------------------------------------------------------

  const MetricReportsListingQuery = useGetTelemetryServiceMetricReports({
    query: {
      enabled: computed(() => !!ManagedSystemURI.value && !SystemLoading.value),
      staleTime: 60000, // 1 minute - collection membership rarely changes
    },
  });

  // -------------------------------------------------------------------------
  // Step 2: Find the HealthMetrics report URI from the listing
  // -------------------------------------------------------------------------

  const HealthMetricsURI = computed<string | null>(() => {
    const Members = MetricReportsListingQuery.data.value?.Members ?? [];

    // Find member with *HealthMetrics* in URI
    const HealthMetricsMember = Members.find((M) =>
      M['@odata.id']?.includes('HealthMetrics'),
    );

    return HealthMetricsMember?.['@odata.id'] ?? null;
  });

  // -------------------------------------------------------------------------
  // Step 3: Fetch just the HealthMetrics report
  // -------------------------------------------------------------------------

  const HealthMetricsReportQuery = useQuery({
    queryKey: computed(() => ['redfish', 'MetricReport', HealthMetricsURI.value] as const),
    queryFn: () =>
      apiInstance<MetricReport>({
        url: HealthMetricsURI.value!,
        method: 'GET',
      }),
    enabled: computed(() => !!HealthMetricsURI.value),
    staleTime: 30000, // 30 seconds - metrics can change
  });

  const HealthMetricsReport = computed<MetricReport | null>(() =>
    HealthMetricsReportQuery.data.value ?? null,
  );

  // -------------------------------------------------------------------------
  // Computed: Parse MetricValues into component health entries
  // -------------------------------------------------------------------------

  const ComponentHealth = computed<ComponentHealthEntry[]>(() => {
    const Report = HealthMetricsReport.value;
    if (!Report?.MetricValues || Report.MetricValues.length === 0) {
      return [];
    }

    // Filter to only Health/HealthRollup metrics
    const HealthMetrics = Report.MetricValues.filter((M) => {
      const Path = M.MetricProperty || '';
      return (
        Path.includes('/Status/Health') ||
        Path.endsWith('/Health') ||
        Path.endsWith('/HealthRollup')
      );
    });

    if (HealthMetrics.length === 0) {
      return [];
    }

    // Group by component
    const ComponentMap: Record<
      string,
      { Health?: string; HealthRollup?: string; URI?: string }
    > = {};

    for (const Metric of HealthMetrics) {
      const MetricProperty = Metric.MetricProperty || '';
      const ComponentKey = extractComponentName(MetricProperty);
      const MetricType = MetricProperty.endsWith('/HealthRollup')
        ? 'HealthRollup'
        : 'Health';

      if (!ComponentMap[ComponentKey]) {
        ComponentMap[ComponentKey] = {
          URI: extractResourceURI(MetricProperty),
        };
      }
      ComponentMap[ComponentKey][MetricType] = Metric.MetricValue ?? undefined;
    }

    // Convert to array for rendering
    const Entries: ComponentHealthEntry[] = Object.entries(ComponentMap).map(
      ([Key, Values]) => ({
        Name: formatComponentName(Key),
        ComponentKey: Key,
        Health: Values.Health || '-',
        HealthRollup: Values.HealthRollup || '-',
        URI: Values.URI || '',
      }),
    );

    // Sort components
    return Entries.sort(sortComponents);
  });

  const isLoading = computed(
    () =>
      MetricReportsListingQuery.isLoading.value ||
      HealthMetricsReportQuery.isLoading.value,
  );

  const isError = computed(
    () =>
      MetricReportsListingQuery.isError.value ||
      HealthMetricsReportQuery.isError.value,
  );

  const hasMetrics = computed(() => ComponentHealth.value.length > 0);

  // -------------------------------------------------------------------------
  // Return
  // -------------------------------------------------------------------------

  return {
    ComponentHealth,
    isLoading,
    isError,
    hasMetrics,
  };
}

/**
 * Get CSS class for health status color coding
 */
export function getHealthStatusClass(Status: string): string {
  switch (Status) {
    case ResourceHealth.OK:
      return 'text-success';
    case ResourceHealth.Warning:
      return 'text-warning';
    case ResourceHealth.Critical:
      return 'text-danger';
    default:
      return '';
  }
}

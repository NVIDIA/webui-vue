/**
 * Composable for managing processor power limits (VR200 NVL72).
 *
 * Redfish-first: uses EnvironmentMetrics and Chassis model types directly.
 * No intermediate UI view interfaces -- template accesses Redfish fields
 * with their original PascalCase names.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed } from 'vue';

import { apiInstance } from '@/api/mutator/axios-instance';
import type { Chassis } from '@/api/model/Chassis';
import type { EnvironmentMetrics } from '@/api/model/EnvironmentMetrics';

import { fetchAllSubResources, useRedfishCollection } from './useRedfishCollection';

// ---------------------------------------------------------------------------
// OEM extension types (not in generated models)
// ---------------------------------------------------------------------------

/** Nvidia OEM extension on EnvironmentMetrics */
export interface NvidiaEnvironmentMetrics {
  Nvidia?: {
    '@odata.type'?: string;
    BasePowerWatts?: {
      SetPoint?: number | null;
      DefaultSetPoint?: number | null;
      AllowableMin?: number | null;
      AllowableMax?: number | null;
    };
    EDPpPercent?: {
      SetPoint?: number | null;
      AllowableMin?: number | null;
      AllowableMax?: number | null;
      Persistency?: boolean | null;
    };
    GPUViewCPULimitWatts?: number | null;
    PowerLimitPersistency?: boolean | null;
    RequestedOneshotPowerLimitWatts?: number | null;
    RequestedPersistentPowerLimitWatts?: number | null;
  };
}

/** EnvironmentMetrics with typed Nvidia OEM extension */
export type ProcessorEnvironmentMetrics = EnvironmentMetrics & {
  Oem?: NvidiaEnvironmentMetrics;
};

// ---------------------------------------------------------------------------
// Module grouping type
// ---------------------------------------------------------------------------

export interface ProcessorModule {
  Id: string;
  Name: string;
  CpuMetrics: ProcessorEnvironmentMetrics[];
  GpuMetrics: ProcessorEnvironmentMetrics[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse processor type and index from an EnvironmentMetrics @odata.id.
 * e.g., ".../Processors/GPU_2/EnvironmentMetrics" -> { Type: 'GPU', Index: 2 }
 */
function parseProcessorInfo(uri: string) {
  const match = uri.match(/\/Processors\/(CPU|GPU)_(\d+)/);
  if (!match) return null;
  return { Type: match[1] as 'CPU' | 'GPU', Index: Number(match[2]) };
}

/**
 * Normalize a Redfish SetPoint value:
 * - If SetPoint > AllowableMax, clamp to AllowableMax (UINT32_MAX = "at the limit")
 * - If SetPoint is within [AllowableMin, AllowableMax], use it
 * - Otherwise fall back to DefaultSetPoint, then AllowableMin
 */
export function normalizeSetPoint(
  SetPoint: number | null | undefined,
  AllowableMin: number | null | undefined,
  AllowableMax: number | null | undefined,
  DefaultSetPoint?: number | null,
): number | null {
  const min = AllowableMin ?? null;
  const max = AllowableMax ?? null;

  if (typeof SetPoint === 'number' && min !== null && max !== null) {
    if (SetPoint > max) return max;
    if (SetPoint >= min) return SetPoint;
  }
  if (
    typeof DefaultSetPoint === 'number' &&
    min !== null &&
    max !== null &&
    DefaultSetPoint >= min &&
    DefaultSetPoint <= max
  ) {
    return DefaultSetPoint;
  }
  return min;
}

/**
 * Don't retry 4xx client errors; retry server / network errors up to 3 times.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response
    ?.status;
  if (status && status >= 400 && status < 500) return false;
  return failureCount < 3;
}

/**
 * Extract a processor ID (e.g., "CPU_0", "GPU_1") from a Chassis @odata.id.
 * Maps "/redfish/v1/Chassis/HGX_CPU_0" -> "CPU_0"
 */
function chassisUriToProcessorId(uri: string): string | null {
  const segment = uri.split('/').pop() ?? '';
  const match = segment.match(/^HGX_((?:CPU|GPU)_\d+)$/);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

const POWER_LIMITS_KEY = ['redfish', 'powerLimits'] as const;

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

export function usePowerLimits() {
  const queryClient = useQueryClient();

  // ------ Query 1: Fetch all processor EnvironmentMetrics ------------------
  // Discovers Processors across ALL Systems, then fetches EnvironmentMetrics.
  const {
    data: MetricsData,
    isLoading: MetricsLoading,
    error: MetricsError,
    refetch,
  } = useQuery({
    queryKey: POWER_LIMITS_KEY,
    queryFn: async (): Promise<ProcessorEnvironmentMetrics[]> => {
      const Processors = await fetchAllSubResources<{
        '@odata.id': string;
        Name?: string;
        Id?: string;
      }>('/redfish/v1/Systems', 'Processors', queryClient);

      if (Processors.length === 0) return [];

      // Dynamic URIs discovered at runtime -- no generated endpoint exists
      // for per-processor EnvironmentMetrics. Raw apiInstance is acceptable
      // here because the call is inside a useQuery queryFn (see
      // redfish-first-api-calls.mdc, exception #3).
      const results = await Promise.all(
        Processors.map(async (Processor) => {
          const uri = Processor['@odata.id'];
          if (!uri) return null;
          try {
            return await apiInstance<ProcessorEnvironmentMetrics>({
              url: `${uri}/EnvironmentMetrics`,
              method: 'GET',
            });
          } catch {
            return null;
          }
        }),
      );

      return results.filter(
        (m): m is ProcessorEnvironmentMetrics => m !== null,
      );
    },
    retry: shouldRetry,
    staleTime: 30000,
  });

  // ------ Query 2: Fetch Chassis for ProcessorModule discovery -------------
  const { data: ChassisData, isLoading: ChassisLoading } =
    useRedfishCollection<Chassis>('/redfish/v1/Chassis');

  // ------ Combined loading / error state -----------------------------------
  const isLoading = computed(
    () => MetricsLoading.value || ChassisLoading.value,
  );
  const error = computed(() => MetricsError.value);

  // ------ Derived: split metrics into CPU and GPU --------------------------
  const CpuMetrics = computed<ProcessorEnvironmentMetrics[]>(() => {
    const metrics = MetricsData.value ?? [];
    return metrics.filter((m) => {
      const info = parseProcessorInfo(m['@odata.id']);
      return info?.Type === 'CPU';
    });
  });

  const GpuMetrics = computed<ProcessorEnvironmentMetrics[]>(() => {
    const metrics = MetricsData.value ?? [];
    return metrics.filter((m) => {
      const info = parseProcessorInfo(m['@odata.id']);
      return info?.Type === 'GPU';
    });
  });

  // ------ Derived: ProcessorModule grouping --------------------------------
  // Groups CPU/GPU EnvironmentMetrics by ProcessorModule using Chassis
  // Links.Contains. Falls back to a single default module.
  const modules = computed<ProcessorModule[]>(() => {
    const ChassisMembers = ChassisData.value?.Members ?? [];
    const cpus = CpuMetrics.value;
    const gpus = GpuMetrics.value;

    // Filter to ProcessorModule chassis entries
    const ProcessorModules = ChassisMembers.filter(
      (c) =>
        c.ChassisType === 'Module' &&
        c.Id != null &&
        c.Id.includes('ProcessorModule'),
    );

    // Fallback: if no ProcessorModules found, return a single default module
    if (ProcessorModules.length === 0) {
      if (cpus.length === 0 && gpus.length === 0) return [];
      return [{ Id: 'default', Name: 'Power Limits', CpuMetrics: cpus, GpuMetrics: gpus }];
    }

    return ProcessorModules.map((Module) => {
      const Contains = Module.Links?.Contains ?? [];
      const ContainedProcessorIds = new Set(
        Contains.map((ref) => chassisUriToProcessorId(ref['@odata.id'] ?? ''))
          .filter((id): id is string => id !== null),
      );

      // Match metrics by processor ID extracted from the @odata.id URI
      const matchesModule = (m: ProcessorEnvironmentMetrics) => {
        const info = parseProcessorInfo(m['@odata.id']);
        return info !== null && ContainedProcessorIds.has(`${info.Type}_${info.Index}`);
      };

      return {
        Id: Module.Id ?? Module['@odata.id'],
        Name: Module.Name ?? Module.Id ?? 'Unknown Module',
        CpuMetrics: cpus.filter(matchesModule),
        GpuMetrics: gpus.filter(matchesModule),
      };
    });
  });

  // ------ Mutation: set CPU power limit ------------------------------------
  // Dynamic URI mutation -- MetricsUri is discovered at runtime.
  // Wrapped in useMutation per redfish-first-api-calls.mdc exception #3.
  const setCpuLimit = useMutation({
    mutationFn: async ({
      MetricsUri,
      SetPoint,
    }: {
      MetricsUri: string;
      SetPoint: number;
    }) => {
      return apiInstance<void>({
        url: MetricsUri,
        method: 'PATCH',
        data: {
          PowerLimitWatts: { SetPoint },
        },
      });
    },
    onSuccess: (_result, { MetricsUri, SetPoint }) => {
      queryClient.setQueryData<ProcessorEnvironmentMetrics[]>(
        POWER_LIMITS_KEY,
        (old) => {
          if (!old) return old;
          return old.map((m) =>
            m['@odata.id'] === MetricsUri
              ? { ...m, PowerLimitWatts: { ...m.PowerLimitWatts, SetPoint } }
              : m,
          );
        },
      );
      queryClient.invalidateQueries({ queryKey: POWER_LIMITS_KEY });
    },
  });

  // ------ Mutation: set GPU power limit ------------------------------------
  // Dynamic URI mutation -- MetricsUri is discovered at runtime.
  // Wrapped in useMutation per redfish-first-api-calls.mdc exception #3.
  const setGpuLimit = useMutation({
    mutationFn: async ({
      MetricsUri,
      SetPoint,
      BasePowerSetPoint,
      EDPpSetPoint,
    }: {
      MetricsUri: string;
      SetPoint: number;
      BasePowerSetPoint: number;
      EDPpSetPoint?: number;
    }) => {
      const OemNvidia: Record<string, unknown> = {
        BasePowerWatts: { SetPoint: BasePowerSetPoint },
      };
      if (EDPpSetPoint !== undefined) {
        OemNvidia.EDPpPercent = { SetPoint: EDPpSetPoint };
      }
      return apiInstance<void>({
        url: MetricsUri,
        method: 'PATCH',
        data: {
          PowerLimitWatts: { SetPoint },
          Oem: { Nvidia: OemNvidia },
        },
      });
    },
    onSuccess: (
      _result,
      { MetricsUri, SetPoint, BasePowerSetPoint, EDPpSetPoint },
    ) => {
      queryClient.setQueryData<ProcessorEnvironmentMetrics[]>(
        POWER_LIMITS_KEY,
        (old) => {
          if (!old) return old;
          return old.map((m) => {
            if (m['@odata.id'] !== MetricsUri) return m;
            const Nvidia: NvidiaEnvironmentMetrics['Nvidia'] = {
              ...m.Oem?.Nvidia,
              BasePowerWatts: {
                ...m.Oem?.Nvidia?.BasePowerWatts,
                SetPoint: BasePowerSetPoint,
              },
            };
            if (EDPpSetPoint !== undefined) {
              Nvidia!.EDPpPercent = {
                ...m.Oem?.Nvidia?.EDPpPercent,
                SetPoint: EDPpSetPoint,
              };
            }
            return {
              ...m,
              PowerLimitWatts: { ...m.PowerLimitWatts, SetPoint },
              Oem: { ...m.Oem, Nvidia },
            };
          });
        },
      );
      queryClient.invalidateQueries({ queryKey: POWER_LIMITS_KEY });
    },
  });

  return {
    /** ProcessorModule groupings with raw EnvironmentMetrics */
    modules,
    /** All CPU EnvironmentMetrics (flat) */
    CpuMetrics,
    /** All GPU EnvironmentMetrics (flat) */
    GpuMetrics,
    /** True while initial fetch is in progress */
    isLoading,
    /** Query-level error, if any */
    error,
    /** Manually trigger a refetch */
    refetch,
    /** Mutation: PATCH CPU PowerLimitWatts.SetPoint */
    setCpuLimit,
    /** Mutation: PATCH GPU PowerLimitWatts + BasePowerWatts + optional EDPpPercent */
    setGpuLimit,
    /** Normalize a SetPoint (exported for use in component edit sync) */
    normalizeSetPoint,
  };
}

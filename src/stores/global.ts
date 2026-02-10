/**
 * Global Store - Pinia store for widely-used Redfish resources
 *
 * Uses Vue Query internally for caching and SSE invalidation support.
 * Pinia provides convenient reactive access to the Vue Query data.
 *
 * Provides centralized access to:
 * - Manager (ManagerProvidingService) - The BMC providing this Redfish service
 * - ManagedSystem (ManagerForServers[0]) - The primary system managed by this BMC
 *
 * Navigation follows Redfish best practices:
 * ServiceRoot → ManagerProvidingService → ManagerForServers[0] → System
 *
 * Fallback chain when ManagerProvidingService is not available:
 * ServiceRoot → Managers[0] → Links.ManagerForServers[0] → System
 */
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { useQueryClient } from '@tanstack/vue-query';
import {
  useGetServiceRoot,
  useGetManagers,
  useGetManagersById,
  useGetSystems,
  useGetSystemsById,
} from '@/api/endpoints/redfish.gen';
import {
  clearServiceRootCache,
  clearManagersCache,
  clearSystemsCache,
} from '@/api/mutator/axios-instance';
import type { ServiceRoot } from '@/api/model/ServiceRoot';
import type { ResourcePowerState } from '@/api/model/ResourcePowerState';
import type { ComputerSystemBootProgressTypes } from '@/api/model/ComputerSystemBootProgressTypes';

// ============================================================================
// Query Keys (for SSE invalidation)
// ============================================================================

/**
 * Query key factory for global store resources.
 * Used by SSE handlers to invalidate related queries.
 */
export const globalStoreKeys = {
  all: ['globalStore'] as const,
  serviceRoot: () => [...globalStoreKeys.all, 'serviceRoot'] as const,
  manager: () => [...globalStoreKeys.all, 'manager'] as const,
  managedSystem: () => [...globalStoreKeys.all, 'managedSystem'] as const,
};

// ============================================================================
// Helpers (module-level for use in store)
// ============================================================================

/**
 * Extract the ID (last segment) from a Redfish URI.
 * E.g., "/redfish/v1/Managers/bmc" -> "bmc"
 */
function extractIdFromUri(uri: string | undefined): string | undefined {
  if (!uri) return undefined;
  return uri.split('/').pop();
}

/**
 * Extract ManagerProvidingService ID from ServiceRoot.
 * Handles both Links.ManagerProvidingService and top-level ManagerProvidingService.
 */
function getManagerProvidingServiceId(
  serviceRoot: ServiceRoot | undefined,
): string | undefined {
  if (!serviceRoot) return undefined;

  // Try Links.ManagerProvidingService first (standard location)
  const linksPath = (
    serviceRoot.Links as
      | { ManagerProvidingService?: { '@odata.id'?: string } }
      | undefined
  )?.ManagerProvidingService?.['@odata.id'];

  if (linksPath) return extractIdFromUri(linksPath);

  // Try top-level ManagerProvidingService (some implementations)
  const topLevelPath = (
    serviceRoot as unknown as {
      ManagerProvidingService?: { '@odata.id'?: string };
    }
  )?.ManagerProvidingService?.['@odata.id'];

  return extractIdFromUri(topLevelPath);
}

// ============================================================================
// Store Definition
// ============================================================================

// Boot polling interval (ms) when tracking a power transition / boot sequence
const BOOT_POLL_INTERVAL = 1000;
const BOOT_POLL_MAX_INTERVAL = 30000;
const BOOT_POLL_BACKOFF_STEP = 15000;
// Minimum time (ms) to keep polling after a power event before allowing
// the "stable" check to stop polling.  BMCs report PowerState=On and
// BootProgress=None before the boot firmware has updated BootProgress,
// so stopping immediately would miss the entire boot sequence.
const BOOT_POLL_MIN_DURATION = 60000;

export const useGlobalStore = defineStore('global', () => {
  const queryClient = useQueryClient();

  // ---------------------------------------------------------------------------
  // Boot-progress polling (activated by SSE power events)
  // ---------------------------------------------------------------------------
  const isBootPolling = ref(false);
  const bootPollInterval = ref(BOOT_POLL_INTERVAL);
  let bootPollTimer: ReturnType<typeof setTimeout> | null = null;
  let bootPollStabilityTimer: ReturnType<typeof setTimeout> | null = null;
  let bootPollStartTime = 0;

  // ---------------------------------------------------------------------------
  // Vue Query: ServiceRoot
  // ---------------------------------------------------------------------------

  const ServiceRootQuery = useGetServiceRoot({
    query: {
      staleTime: Infinity, // ServiceRoot rarely changes
    },
  });

  const ServiceRoot = computed(() => ServiceRootQuery.data.value ?? null);

  // ---------------------------------------------------------------------------
  // Vue Query: Manager (with fallback to first in collection)
  // ---------------------------------------------------------------------------

  // First, try to get ManagerId from ManagerProvidingService
  const ManagerIdFromServiceRoot = computed(() =>
    getManagerProvidingServiceId(ServiceRootQuery.data.value),
  );

  // Fallback: fetch Managers collection if ManagerProvidingService not available
  const ManagersCollectionQuery = useGetManagers({
    query: {
      enabled: computed(
        () =>
          ServiceRootQuery.isSuccess.value &&
          !ManagerIdFromServiceRoot.value,
      ),
      staleTime: Infinity,
    },
  });

  // Final ManagerId: from ServiceRoot or first in collection
  const ManagerId = computed(() => {
    if (ManagerIdFromServiceRoot.value) {
      return ManagerIdFromServiceRoot.value;
    }
    return extractIdFromUri(
      ManagersCollectionQuery.data.value?.Members?.[0]?.['@odata.id'],
    );
  });

  // Fetch the Manager by ID
  const ManagerQuery = useGetManagersById(ManagerId, {
    query: {
      enabled: computed(() => !!ManagerId.value),
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  });

  const Manager = computed(() => ManagerQuery.data.value ?? null);

  // ---------------------------------------------------------------------------
  // Vue Query: ManagedSystem (with fallback to first in collection)
  // ---------------------------------------------------------------------------

  // First, try to get SystemId from ManagerForServers
  const SystemIdFromManager = computed(() =>
    extractIdFromUri(
      ManagerQuery.data.value?.Links?.ManagerForServers?.[0]?.['@odata.id'],
    ),
  );

  // Fallback: fetch Systems collection if ManagerForServers not available
  const SystemsCollectionQuery = useGetSystems({
    query: {
      enabled: computed(
        () => ManagerQuery.isSuccess.value && !SystemIdFromManager.value,
      ),
      staleTime: Infinity,
    },
  });

  // Final SystemId: from Manager or first in collection
  const SystemId = computed(() => {
    if (SystemIdFromManager.value) {
      return SystemIdFromManager.value;
    }
    return extractIdFromUri(
      SystemsCollectionQuery.data.value?.Members?.[0]?.['@odata.id'],
    );
  });

  // Fetch the System by ID
  // refetchInterval is driven by isBootPolling — when a power event starts a
  // boot sequence we poll rapidly until the system reaches a stable state.
  const ManagedSystemQuery = useGetSystemsById(SystemId, {
    query: {
      enabled: computed(() => !!SystemId.value),
      staleTime: 30 * 1000, // 30 seconds - system state can change
      refetchInterval: computed(() =>
        isBootPolling.value ? bootPollInterval.value : false,
      ),
      meta: computed(() =>
        isBootPolling.value ? { hideLoadingBar: true } : {},
      ),
    },
  });

  const ManagedSystem = computed(() => ManagedSystemQuery.data.value ?? null);

  // ---------------------------------------------------------------------------
  // Computed: Status
  // ---------------------------------------------------------------------------

  const isLoading = computed(
    () =>
      ServiceRootQuery.isLoading.value ||
      ManagerQuery.isLoading.value ||
      ManagedSystemQuery.isLoading.value,
  );

  const isLoaded = computed(
    () => Manager.value !== null && ManagedSystem.value !== null,
  );

  const error = computed(() => {
    if (ServiceRootQuery.error.value) return ServiceRootQuery.error.value;
    if (ManagerQuery.error.value) return ManagerQuery.error.value;
    if (ManagedSystemQuery.error.value) return ManagedSystemQuery.error.value;
    return null;
  });

  // ---------------------------------------------------------------------------
  // Computed: URIs
  // ---------------------------------------------------------------------------

  const ManagerURI = computed(() => Manager.value?.['@odata.id'] ?? null);
  const ManagedSystemURI = computed(
    () => ManagedSystem.value?.['@odata.id'] ?? null,
  );

  // ---------------------------------------------------------------------------
  // Computed: ManagedSystem derived state
  // ---------------------------------------------------------------------------

  /** Current power state of the system */
  const PowerState = computed<ResourcePowerState | undefined>(
    () => ManagedSystem.value?.PowerState as ResourcePowerState | undefined,
  );

  /**
   * Last boot progress state (e.g. 'OSRunning', 'None').
   * If the BootProgress field disappears during boot, keep the previous state.
   */
  const lastBootProgressState = ref<ComputerSystemBootProgressTypes | undefined>(
    undefined,
  );
  const BootProgressState = computed<ComputerSystemBootProgressTypes | undefined>(
    () => ManagedSystem.value?.BootProgress?.LastState ?? lastBootProgressState.value,
  );
  watch(
    () => ManagedSystem.value?.BootProgress?.LastState,
    (state) => {
      if (state) {
        lastBootProgressState.value = state;
      }
    },
  );

  /** Timestamp of the last boot state change */
  const BootProgressTime = computed<string | null | undefined>(
    () => ManagedSystem.value?.BootProgress?.LastStateTime,
  );

  /** OEM-specific boot progress state */
  const BootProgressOemState = computed<string | null | undefined>(() => {
    const boot = ManagedSystem.value?.BootProgress;
    if (!boot) return null;

    const direct = boot.OemLastState;
    if (typeof direct === 'string' && direct.length > 0) return direct;

    const oem = boot.Oem as Record<string, unknown> | undefined;
    if (!oem) return null;

    const vendor = oem.Nvidia as Record<string, unknown> | undefined;
    const vendorState =
      (vendor?.OemLastState as string | undefined) ??
      (vendor?.LastState as string | undefined);
    if (typeof vendorState === 'string' && vendorState.length > 0) return vendorState;

    const oemState = oem.OemLastState as string | undefined;
    if (typeof oemState === 'string' && oemState.length > 0) return oemState;

    return null;
  });

  /** Whether the system is actively booting (needs rapid polling) */
  const IsBooting = computed(() => {
    const power = PowerState.value;
    const boot = BootProgressState.value;

    // Power transitioning
    if (power === 'PoweringOn' || power === 'PoweringOff') return true;

    // Active boot state (not idle, not fully booted)
    if (boot && boot !== 'None' && boot !== 'OSRunning') return true;

    return false;
  });

  // Helper: is the system in a stable state (safe to stop polling)?
  const isSystemStable = (
    power: ResourcePowerState | undefined,
    boot: ComputerSystemBootProgressTypes | undefined,
  ) => {
    const isBootProgressStable = boot === 'None' || boot === 'OSRunning';
    return power === 'On' && isBootProgressStable;
  };

  const stopBootPolling = () => {
    console.log('[Global] Boot polling stopped — system stable');
    isBootPolling.value = false;
    bootPollInterval.value = BOOT_POLL_INTERVAL;
    if (bootPollTimer) {
      clearTimeout(bootPollTimer);
      bootPollTimer = null;
    }
    if (bootPollStabilityTimer) {
      clearTimeout(bootPollStabilityTimer);
      bootPollStabilityTimer = null;
    }
  };

  const scheduleBootPollingBackoff = () => {
    if (!isBootPolling.value) return;
    bootPollInterval.value = Math.min(
      bootPollInterval.value * 2,
      BOOT_POLL_MAX_INTERVAL,
    );
    bootPollTimer = setTimeout(scheduleBootPollingBackoff, BOOT_POLL_BACKOFF_STEP);
  };

  // Auto-stop boot polling when system reaches a stable state.
  // Note: We intentionally do not treat power === 'Off' as stable here.
  // The polling backs off to BOOT_POLL_MAX_INTERVAL and serves as a
  // keep-alive to detect remote power-on events.
  // Suppress the check for BOOT_POLL_MIN_DURATION after polling starts
  // because BMCs report PowerState=On + BootProgress=None before the
  // boot firmware has begun updating BootProgress.
  watch([PowerState, BootProgressState], ([power, boot]) => {
    if (!isBootPolling.value) return;

    if (Date.now() - bootPollStartTime < BOOT_POLL_MIN_DURATION) return;

    if (isSystemStable(power, boot)) {
      stopBootPolling();
    }
  });

  // Auto-start boot polling when booting is detected outside SSE.
  watch([IsBooting, PowerState, BootProgressState], ([isBooting, power, boot]) => {
    if (isBootPolling.value) return;
    if (!isBooting) return;
    if (isSystemStable(power, boot)) return;
    void startBootPolling();
  });

  // Reset polling interval when OEM boot state changes — the system is
  // actively progressing through boot stages, so poll fast again and
  // let the backoff ramp back up.
  watch(BootProgressOemState, () => {
    if (!isBootPolling.value) return;
    bootPollInterval.value = BOOT_POLL_INTERVAL;
    if (bootPollTimer) {
      clearTimeout(bootPollTimer);
      bootPollTimer = null;
    }
    scheduleBootPollingBackoff();
  });

  /** System asset tag */
  const AssetTag = computed(() => ManagedSystem.value?.AssetTag);

  /** System model */
  const Model = computed(() => ManagedSystem.value?.Model);

  /** System serial number */
  const SerialNumber = computed(() => ManagedSystem.value?.SerialNumber);

  /** System health status */
  const HealthStatus = computed(() => ManagedSystem.value?.Status?.Health);

  /** System state */
  const SystemState = computed(() => ManagedSystem.value?.Status?.State);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  /**
   * Start rapid polling for boot progress.
   * Called by SSE power-event handler to track a power transition / boot
   * sequence. Polling stops automatically when a stable state is reached.
   */
  async function startBootPolling(): Promise<void> {
    console.log('[Global] Boot polling started');
    isBootPolling.value = true;
    bootPollInterval.value = BOOT_POLL_INTERVAL;
    bootPollStartTime = Date.now();
    if (bootPollTimer) {
      clearTimeout(bootPollTimer);
      bootPollTimer = null;
    }
    // Schedule a delayed stability check after BOOT_POLL_MIN_DURATION.
    // The reactive watch on [PowerState, BootProgressState] suppresses
    // the stability check during the min-duration window. If the system
    // reaches a stable state within that window, the watch won't fire
    // again (values stop changing). This timer ensures we re-check.
    if (bootPollStabilityTimer) {
      clearTimeout(bootPollStabilityTimer);
    }
    bootPollStabilityTimer = setTimeout(() => {
      bootPollStabilityTimer = null;
      if (!isBootPolling.value) return;
      if (isSystemStable(PowerState.value, BootProgressState.value)) {
        stopBootPolling();
      }
    }, BOOT_POLL_MIN_DURATION + 1000); // +1s buffer
    scheduleBootPollingBackoff();
    // Immediate refetch so the UI updates right away
    await refetchManagedSystem();
  }

  /**
   * Refetch all data by invalidating Vue Query and axios caches.
   */
  async function refetch(): Promise<void> {
    // Clear axios ETag cache first
    await Promise.all([
      clearServiceRootCache(),
      clearManagersCache(),
      clearSystemsCache(),
    ]);

    // Then invalidate Vue Query cache (triggers refetch)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [], exact: true }),
      queryClient.invalidateQueries({ queryKey: ['Managers'] }),
      queryClient.invalidateQueries({ queryKey: ['Systems'] }),
    ]);
  }

  /**
   * Invalidate only the Manager query (Vue Query + axios cache).
   */
  async function refetchManager(): Promise<void> {
    await clearManagersCache();
    await queryClient.invalidateQueries({
      queryKey: ['Managers', ManagerId.value],
    });
  }

  /**
   * Invalidate only the ManagedSystem query (Vue Query + axios cache).
   */
  async function refetchManagedSystem(): Promise<void> {
    await clearSystemsCache();
    await queryClient.invalidateQueries({
      queryKey: ['Systems', SystemId.value],
    });
  }

  /**
   * Get Manager, waiting for Vue Query to complete if still loading.
   * For imperative use in other Pinia stores.
   */
  async function getManager(): Promise<typeof Manager.value> {
    // If already loaded, return immediately
    if (Manager.value) return Manager.value;

    // Wait for query to complete
    return new Promise((resolve) => {
      const unwatch = ManagerQuery.suspense().then(() => {
        resolve(ManagerQuery.data.value ?? null);
      }).catch(() => {
        resolve(null);
      });
      return unwatch;
    });
  }

  /**
   * Get ManagedSystem, waiting for Vue Query to complete if still loading.
   * For imperative use in other Pinia stores.
   */
  async function getManagedSystem(): Promise<typeof ManagedSystem.value> {
    // If already loaded, return immediately
    if (ManagedSystem.value) return ManagedSystem.value;

    // Wait for query to complete
    return new Promise((resolve) => {
      ManagedSystemQuery.suspense().then(() => {
        resolve(ManagedSystemQuery.data.value ?? null);
      }).catch(() => {
        resolve(null);
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

  return {
    // Core resources (from Vue Query)
    ServiceRoot,
    Manager,
    ManagedSystem,

    // IDs (for query key construction)
    ManagerId,
    SystemId,

    // URIs
    ManagerURI,
    ManagedSystemURI,

    // Derived state
    PowerState,
    BootProgressState,
    BootProgressTime,
    BootProgressOemState,
    IsBooting,
    AssetTag,
    Model,
    SerialNumber,
    HealthStatus,
    SystemState,

    // Status
    isLoading,
    isLoaded,
    error,

    // Boot polling state (used by LoadingBar to suppress during boot)
    isBootPolling,

    // Actions
    refetch,
    refetchManager,
    refetchManagedSystem,
    startBootPolling,

    // Imperative getters (for other Pinia stores)
    getManager,
    getManagedSystem,
  };
});

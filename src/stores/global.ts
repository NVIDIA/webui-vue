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
import { computed } from 'vue';
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

export const useGlobalStore = defineStore('global', () => {
  const queryClient = useQueryClient();

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
  const ManagedSystemQuery = useGetSystemsById(SystemId, {
    query: {
      enabled: computed(() => !!SystemId.value),
      staleTime: 30 * 1000, // 30 seconds - system state can change
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
      queryClient.invalidateQueries({ queryKey: ['getServiceRoot'] }),
      queryClient.invalidateQueries({ queryKey: ['getManagers'] }),
      queryClient.invalidateQueries({ queryKey: ['getSystems'] }),
    ]);
  }

  /**
   * Invalidate only the Manager query (Vue Query + axios cache).
   */
  async function refetchManager(): Promise<void> {
    await clearManagersCache();
    await queryClient.invalidateQueries({
      queryKey: ['getManagers', ManagerId.value],
    });
  }

  /**
   * Invalidate only the ManagedSystem query (Vue Query + axios cache).
   */
  async function refetchManagedSystem(): Promise<void> {
    await clearSystemsCache();
    await queryClient.invalidateQueries({
      queryKey: ['getSystems', SystemId.value],
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
    AssetTag,
    Model,
    SerialNumber,
    HealthStatus,
    SystemState,

    // Status
    isLoading,
    isLoaded,
    error,

    // Actions
    refetch,
    refetchManager,
    refetchManagedSystem,

    // Imperative getters (for other Pinia stores)
    getManager,
    getManagedSystem,
  };
});

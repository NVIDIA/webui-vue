/**
 * useManagedSystem - Vue Query composable for the managed ComputerSystem
 *
 * Follows Redfish navigation to get the System managed by this BMC:
 * ServiceRoot → ManagerProvidingService → ManagerForServers[0] → System
 *
 * Provides reactive PowerState and other system info.
 */
import { computed } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { apiInstance } from '@/api/mutator/axios-instance';
import type { ServiceRoot } from '@/api/model/ServiceRoot';
import type { Manager } from '@/api/model/Manager';
import type { ComputerSystem } from '@/api/model/ComputerSystem';
import type { ResourcePowerState } from '@/api/model/ResourcePowerState';

// ============================================================================
// Query Keys
// ============================================================================

export const managedSystemKeys = {
  all: ['managedSystem'] as const,
  serviceRoot: () => ['managedSystem', 'serviceRoot'] as const,
  manager: () => ['managedSystem', 'manager'] as const,
  system: () => ['managedSystem', 'system'] as const,
};

// ============================================================================
// Composable
// ============================================================================

export function useManagedSystem() {
  const queryClient = useQueryClient();

  // Step 1: Get ServiceRoot to find ManagerProvidingService
  const serviceRootQuery = useQuery({
    queryKey: managedSystemKeys.serviceRoot(),
    queryFn: async (): Promise<ServiceRoot> => {
      return apiInstance<ServiceRoot>({ url: '/redfish/v1', method: 'GET' });
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - ServiceRoot rarely changes
  });

  // Step 2: Get the Manager (BMC)
  const managerQuery = useQuery({
    queryKey: managedSystemKeys.manager(),
    queryFn: async (): Promise<Manager> => {
      const serviceRoot = serviceRootQuery.data.value;
      if (!serviceRoot) throw new Error('ServiceRoot not available');

      // Try ManagerProvidingService first (Redfish 2023.1+)
      let managerPath =
        (serviceRoot.Links as { ManagerProvidingService?: { '@odata.id'?: string } })
          ?.ManagerProvidingService?.['@odata.id'] ??
        (serviceRoot as unknown as { ManagerProvidingService?: { '@odata.id'?: string } })
          ?.ManagerProvidingService?.['@odata.id'];

      // Fallback: get first Manager from collection
      if (!managerPath) {
        const managersCollection = await apiInstance<{ Members?: Array<{ '@odata.id': string }> }>({
          url: '/redfish/v1/Managers',
          method: 'GET',
        });
        managerPath = managersCollection.Members?.[0]?.['@odata.id'];
      }

      if (!managerPath) throw new Error('No Manager found');

      return apiInstance<Manager>({ url: managerPath, method: 'GET' });
    },
    enabled: computed(() => !!serviceRootQuery.data.value),
    staleTime: 5 * 60 * 1000,
  });

  // Step 3: Get the managed ComputerSystem
  const systemQuery = useQuery({
    queryKey: managedSystemKeys.system(),
    queryFn: async (): Promise<ComputerSystem> => {
      const manager = managerQuery.data.value;
      if (!manager) throw new Error('Manager not available');

      // Get ManagerForServers (the Systems this Manager manages)
      let systemPath =
        manager.Links?.ManagerForServers?.[0]?.['@odata.id'] ??
        (manager as unknown as { ManagerForServers?: Array<{ '@odata.id': string }> })
          ?.ManagerForServers?.[0]?.['@odata.id'];

      // Fallback: get first System from collection
      if (!systemPath) {
        const systemsCollection = await apiInstance<{ Members?: Array<{ '@odata.id': string }> }>({
          url: '/redfish/v1/Systems',
          method: 'GET',
        });
        systemPath = systemsCollection.Members?.[0]?.['@odata.id'];
      }

      if (!systemPath) throw new Error('No System found');

      return apiInstance<ComputerSystem>({ url: systemPath, method: 'GET' });
    },
    enabled: computed(() => !!managerQuery.data.value),
    staleTime: 30 * 1000, // 30 seconds - System state changes more often
    refetchOnWindowFocus: true,
  });

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------

  /** Current power state of the system */
  const PowerState = computed<ResourcePowerState | undefined>(
    () => systemQuery.data.value?.PowerState as ResourcePowerState | undefined,
  );

  /** System asset tag */
  const AssetTag = computed(() => systemQuery.data.value?.AssetTag);

  /** System model */
  const Model = computed(() => systemQuery.data.value?.Model);

  /** System serial number */
  const SerialNumber = computed(() => systemQuery.data.value?.SerialNumber);

  /** System health status */
  const HealthStatus = computed(() => systemQuery.data.value?.Status?.Health);

  /** System state */
  const SystemState = computed(() => systemQuery.data.value?.Status?.State);

  /** System URI */
  const SystemURI = computed(() => systemQuery.data.value?.['@odata.id']);

  /** Loading state */
  const isLoading = computed(
    () => serviceRootQuery.isLoading.value || managerQuery.isLoading.value || systemQuery.isLoading.value,
  );

  /** Error state */
  const isError = computed(
    () => serviceRootQuery.isError.value || managerQuery.isError.value || systemQuery.isError.value,
  );

  /** Combined error */
  const error = computed(
    () => serviceRootQuery.error.value || managerQuery.error.value || systemQuery.error.value,
  );

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  /** Refetch the system data */
  function refetch() {
    return systemQuery.refetch();
  }

  /** Invalidate system query (triggers refetch) */
  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: managedSystemKeys.system() });
  }

  // -------------------------------------------------------------------------
  // Return
  // -------------------------------------------------------------------------

  return {
    // Raw query access
    systemQuery,
    managerQuery,
    serviceRootQuery,

    // System data
    System: systemQuery.data,
    PowerState,
    AssetTag,
    Model,
    SerialNumber,
    HealthStatus,
    SystemState,
    SystemURI,

    // Status
    isLoading,
    isError,
    error,

    // Actions
    refetch,
    invalidate,
  };
}

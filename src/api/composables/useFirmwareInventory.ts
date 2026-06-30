/**
 * Firmware Inventory Composable
 *
 * Uses useRedfishCollection to fetch firmware inventory with $expand optimization.
 * Categorizes firmware items into BMC and BIOS based on RelatedItem.
 *
 * Returns raw Redfish SoftwareInventory models - Redfish first!
 *
 * Replaces the manual API calls in FirmwareStore.getFirmwareInventory()
 * with Vue Query's automatic caching, refetching, and loading states.
 */
import { computed } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { useRedfishCollection } from '@/api/composables/useRedfishCollection';
import {
  getGetManagersByIdQueryOptions,
  getGetManagersQueryOptions,
} from '@/api/endpoints/redfish.gen';
import { apiInstance } from '@/api/mutator/axios-instance';
import type { SoftwareInventory } from '@/api/model/SoftwareInventory';
// @ts-ignore - Vuex store doesn't have TypeScript declarations
import store from '@/store';
import { isNvidiaPlatform } from '@/i18n';

// Redfish resource types for API responses
interface Manager {
  data?: {
    Links?: {
      ActiveSoftwareImage?: { '@odata.id'?: string };
    };
  };
}

interface BiosResource {
  Links?: {
    ActiveSoftwareImage?: { '@odata.id'?: string };
    SoftwareImages?: { '@odata.id'?: string }[];
  };
}

/** One BMC firmware group (primary BMC, or HGX/HMC BMC on NVIDIA). */
export interface BmcFirmwareGroup {
  key: 'primary' | 'hmc';
  /** i18n key for the section heading */
  sectionTitleKey: string;
  firmware: SoftwareInventory[];
  activeFirmware: SoftwareInventory | undefined;
  backupFirmware: SoftwareInventory | undefined;
  /** Primary platform BMC supports switch-to-backup image */
  switchSupported: boolean;
}

/**
 * Composable for fetching and categorizing firmware inventory.
 *
 * Uses $expand to fetch all firmware items in a single request (when supported).
 * Categorizes items into BMC and BIOS based on RelatedItem references.
 *
 * Returns raw SoftwareInventory models with Redfish property names:
 * - Id, Version, Status.Health, @odata.id
 *
 * @returns Reactive firmware inventory data with BMC and BIOS SoftwareInventory items
 */
export function useFirmwareInventory() {
  // Fetch firmware inventory with $expand optimization
  const { data, isLoading: isInventoryLoading, error, refetch } =
    useRedfishCollection<SoftwareInventory>(
      '/redfish/v1/UpdateService/FirmwareInventory',
      { $expand: '.' },
    );

  const isNvidia = isNvidiaPlatform();

  // Fetch active BMC firmware ID from cached Manager (via GlobalStore)
  const { data: BmcActiveFirmwareId, isLoading: isBmcActiveLoading } = useQuery({
    queryKey: ['firmware', 'activeBmc'],
    queryFn: async (): Promise<string | null> => {
      const manager = (await store.dispatch(
        'global/getManagerProvidingService',
      )) as Manager;
      const Id =
        manager?.data?.Links?.ActiveSoftwareImage?.['@odata.id']
          ?.split('/')
          .pop() ?? null;
      return Id;
    },
    retry: false,
    staleTime: 30000, // 30 seconds - prevents duplicate fetches across components
  });

  // Host BIOS firmware is defined by System/Bios Links.SoftwareImages (same as
  // the legacy Vuex store). Heuristic Id matching incorrectly includes HGX
  // SBIOS entries (e.g. HGX_SBIOS_FW_0) on NVIDIA platforms with no host BIOS.
  const { data: BiosInfo, isLoading: isBiosActiveLoading } = useQuery({
    queryKey: ['firmware', 'bios'],
    queryFn: async (): Promise<{
      activeId: string | null;
      softwareImageIds: string[];
    } | null> => {
      try {
        const systemPath = (await store.dispatch(
          'global/getSystemPath',
        )) as string | null;
        if (!systemPath) return null;

        const response = await apiInstance<BiosResource>({
          url: `${systemPath}/Bios`,
          method: 'GET',
        });
        const softwareImageIds = (response?.Links?.SoftwareImages ?? [])
          .map((image) => image['@odata.id']?.split('/').pop())
          .filter((id): id is string => id != null && id.length > 0);

        return {
          activeId:
            response?.Links?.ActiveSoftwareImage?.['@odata.id']
              ?.split('/')
              .pop() ?? null,
          softwareImageIds,
        };
      } catch {
        return null;
      }
    },
    retry: false,
    staleTime: 30000,
  });

  const BiosActiveFirmwareId = computed(() => BiosInfo.value?.activeId ?? null);
  const BiosSoftwareImageIds = computed(
    () => BiosInfo.value?.softwareImageIds ?? [],
  );

  // Fetch active HGX/HMC BMC firmware ID from the HGX manager (NVIDIA only).
  const { data: managersCollection, isLoading: isManagersLoading } = useQuery({
    ...getGetManagersQueryOptions({
      query: {
        enabled: isNvidia,
        staleTime: 30000,
        retry: false,
      },
    }),
  });

  const hmcManagerId = computed(() => {
    const hmcUri = managersCollection.value?.Members?.find((Member) =>
      (Member['@odata.id'] ?? '').toUpperCase().includes('HGX'),
    )?.['@odata.id'];
    if (!hmcUri) return null;
    return hmcUri.split('/').pop() || null;
  });

  const { data: hmcManager, isLoading: isHmcManagerLoading } = useQuery({
    ...getGetManagersByIdQueryOptions(hmcManagerId, {
      query: {
        enabled: computed(() => isNvidia && !!hmcManagerId.value),
        staleTime: 30000,
        retry: false,
      },
    }),
  });

  const HmcActiveFirmwareId = computed(
    () =>
      hmcManager.value?.Links?.ActiveSoftwareImage?.['@odata.id']
        ?.split('/')
        .pop() ?? null,
  );

  const isHmcActiveLoading = computed(
    () => isManagersLoading.value || isHmcManagerLoading.value,
  );

  // Match primary BMC firmware by RelatedItem or Id (excludes HGX BMC entries).
  const BmcFirmware = computed<SoftwareInventory[]>(() => {
    const Members = data.value?.Members ?? [];
    return Members.filter((Item) => {
      const RelatedItem = Item.RelatedItem?.[0]?.['@odata.id'];
      const chassisName = RelatedItem?.split('/').pop()?.toUpperCase();
      if (chassisName?.includes('BMC') && !chassisName?.includes('HGX')) {
        return true;
      }
      if (!RelatedItem && Item.Id) {
        const id = Item.Id.toUpperCase();
        return id.includes('BMC') && !id.includes('HGX');
      }
      return false;
    });
  });

  // Match HGX/HMC BMC firmware (NVIDIA only).
  const HgxBmcFirmware = computed<SoftwareInventory[]>(() => {
    if (!isNvidia) return [];
    const Members = data.value?.Members ?? [];
    return Members.filter((Item) => {
      const RelatedItem = Item.RelatedItem?.[0]?.['@odata.id'];
      const chassisName = RelatedItem?.split('/').pop()?.toUpperCase();
      if (chassisName?.includes('HGX') && chassisName?.includes('BMC')) {
        return true;
      }
      if (!RelatedItem && Item.Id) {
        const id = Item.Id.toUpperCase();
        return id.includes('HGX') && id.includes('BMC');
      }
      return false;
    });
  });

  // Host BIOS/UEFI images linked from System/Bios SoftwareImages only.
  const BiosFirmware = computed<SoftwareInventory[]>(() => {
    const imageIds = BiosSoftwareImageIds.value;
    if (imageIds.length === 0) return [];
    const idSet = new Set(imageIds);
    const Members = data.value?.Members ?? [];
    return Members.filter((Item) => Item.Id != null && idSet.has(Item.Id));
  });

  function resolveActiveBackup(
    firmware: SoftwareInventory[],
    activeId: string | null | undefined,
  ): {
    activeFirmware: SoftwareInventory | undefined;
    backupFirmware: SoftwareInventory | undefined;
  } {
    const activeFirmware =
      (activeId
        ? firmware.find((Fw) => Fw.Id === activeId)
        : undefined) ?? firmware[0];
    const resolvedActiveId = activeFirmware?.Id;
    const backupFirmware = resolvedActiveId
      ? firmware.find((Fw) => Fw.Id !== resolvedActiveId)
      : undefined;
    return { activeFirmware, backupFirmware };
  }

  // BMC card sections: one per BMC. On NVIDIA with a second HGX BMC, label them BMC and HMC.
  const BmcGroups = computed<BmcFirmwareGroup[]>(() => {
    const rawGroups: {
      key: 'primary' | 'hmc';
      firmware: SoftwareInventory[];
      activeId: string | null | undefined;
      switchSupported: boolean;
    }[] = [];

    if (BmcFirmware.value.length > 0) {
      rawGroups.push({
        key: 'primary',
        firmware: BmcFirmware.value,
        activeId: BmcActiveFirmwareId.value,
        switchSupported: true,
      });
    }
    if (HgxBmcFirmware.value.length > 0) {
      rawGroups.push({
        key: 'hmc',
        firmware: HgxBmcFirmware.value,
        activeId: HmcActiveFirmwareId.value,
        switchSupported: false,
      });
    }

    const hasMultiple = rawGroups.length > 1;

    return rawGroups.map((group) => {
      let sectionTitleKey = 'pageFirmware.sectionTitleBmcCards';
      if (isNvidia && hasMultiple) {
        sectionTitleKey =
          group.key === 'hmc'
            ? 'pageFirmware.sectionTitleHmcCards'
            : 'pageFirmware.sectionTitleBmcCards';
      }

      const { activeFirmware, backupFirmware } = resolveActiveBackup(
        group.firmware,
        group.activeId,
      );

      return {
        key: group.key,
        sectionTitleKey,
        firmware: group.firmware,
        activeFirmware,
        backupFirmware,
        switchSupported: group.switchSupported,
      };
    });
  });

  const isSingleFileUploadEnabled = computed(() => BiosFirmware.value.length === 0);

  const ActiveBmcFirmware = computed(
    () => BmcGroups.value.find((g) => g.key === 'primary')?.activeFirmware,
  );

  const ActiveBiosFirmware = computed(() => {
    if (BiosFirmware.value.length === 0) return undefined;
    return (
      BiosFirmware.value.find((Fw) => Fw.Id === BiosActiveFirmwareId.value) ??
      BiosFirmware.value[0]
    );
  });

  const BackupBmcFirmware = computed(
    () => BmcGroups.value.find((g) => g.key === 'primary')?.backupFirmware,
  );

  const BackupBiosFirmware = computed(() => {
    const activeId = ActiveBiosFirmware.value?.Id;
    if (!activeId) return undefined;
    return BiosFirmware.value.find((Fw) => Fw.Id !== activeId);
  });

  const isBiosFirmwareAvailable = computed(
    () => BiosSoftwareImageIds.value.length > 0 && BiosFirmware.value.length > 0,
  );

  const isLoading = computed(
    () =>
      isInventoryLoading.value ||
      isBmcActiveLoading.value ||
      isBiosActiveLoading.value ||
      isHmcActiveLoading.value,
  );

  return {
    BmcGroups,
    BmcFirmware,
    BiosFirmware,
    BmcActiveFirmwareId,
    BiosActiveFirmwareId,
    isSingleFileUploadEnabled,
    ActiveBmcFirmware,
    ActiveBiosFirmware,
    BackupBmcFirmware,
    BackupBiosFirmware,
    isBiosFirmwareAvailable,
    isLoading,
    error,
    refetch,
  };
}

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
import { useQuery, useQueries } from '@tanstack/vue-query';
import { useRedfishCollection } from '@/api/composables/useRedfishCollection';
import {
  getGetManagersByIdQueryOptions,
  getGetManagersQueryOptions,
} from '@/api/endpoints/redfish.gen';
import { apiInstance } from '@/api/mutator/axios-instance';
import type { Manager } from '@/api/model/Manager';
import type { SoftwareInventory } from '@/api/model/SoftwareInventory';
// @ts-ignore - Vuex store doesn't have TypeScript declarations
import store from '@/store';

/** Vuex manager cache shape from global/getManagerProvidingService */
interface CachedManagerResponse {
  data?: {
    '@odata.id'?: string;
    Id?: string;
    Links?: {
      ActiveSoftwareImage?: { '@odata.id'?: string };
      SoftwareImages?: { '@odata.id'?: string }[];
    };
  };
}

interface BiosResource {
  Links?: {
    ActiveSoftwareImage?: { '@odata.id'?: string };
    SoftwareImages?: { '@odata.id'?: string }[];
  };
}

/** NVIDIA Oem.Nvidia dual-slot metadata on SoftwareInventory */
export interface NvidiaFirmwareSlot {
  Version?: string | null;
  SlotId?: number;
  FirmwareState?: string;
  BuildType?: string;
  FirmwareComparisonNumber?: number;
}

interface NvidiaSoftwareInventoryOem {
  ActiveFirmwareSlot?: NvidiaFirmwareSlot;
  InactiveFirmwareSlot?: NvidiaFirmwareSlot;
}

/** One card section per Manager in /redfish/v1/Managers that has firmware. */
export interface BmcFirmwareGroup {
  /** Manager Id (e.g. BMC_0, HGX_BMC_0), or the bucket name for fallbacks */
  key: string;
  /** Manager Id when the group came from /redfish/v1/Managers */
  managerId: string | undefined;
  /** i18n key for the section heading */
  sectionTitleKey: string;
  /** Appended to the heading when several managers share the same heading */
  sectionTitleSuffix: string | undefined;
  /** True for the manager providing the Redfish service (the primary BMC) */
  isServiceManager: boolean;
  firmware: SoftwareInventory[];
  activeFirmware: SoftwareInventory | undefined;
  backupFirmware: SoftwareInventory | undefined;
  /** Oem.Nvidia.ActiveFirmwareSlot details, when the platform reports slots */
  activeSlot: NvidiaFirmwareSlot | undefined;
  /** Oem.Nvidia.InactiveFirmwareSlot details, when the platform reports slots */
  backupSlot: NvidiaFirmwareSlot | undefined;
  /**
   * Switch-to-backup is only valid for OpenBMC multi-image inventory
   * (distinct @odata.id). NVIDIA dual-slot OEM uses one inventory entry.
   */
  switchSupported: boolean;
}

function odataIdTail(uri: string | undefined | null): string | null {
  if (!uri) return null;
  return uri.split('/').pop() || null;
}

/**
 * Satellite managers (HGX/HMC) get their own heading; everything else is
 * treated as a BMC. Only affects the label, never whether a card is shown.
 */
function managerKind(managerId: string): 'bmc' | 'hmc' {
  const id = managerId.toUpperCase();
  return id.includes('HGX') || id.includes('HMC') ? 'hmc' : 'bmc';
}

function placeholderManager(managerId: string): Manager {
  return {
    '@odata.id': `/redfish/v1/Managers/${managerId}`,
    Id: managerId,
  } as Manager;
}

function managerFromServiceCache(
  cached: CachedManagerResponse['data'],
  managerId: string,
): Manager {
  return {
    ...(cached ?? {}),
    Id: cached?.Id ?? managerId,
    '@odata.id': cached?.['@odata.id'] ?? `/redfish/v1/Managers/${managerId}`,
  } as Manager;
}

/** True when Vuex already has ActiveSoftwareImage or SoftwareImages links. */
function cachedManagerHasLinkedFirmware(
  cached: CachedManagerResponse['data'],
): boolean {
  if (cached?.Links?.ActiveSoftwareImage?.['@odata.id']) return true;
  return (cached?.Links?.SoftwareImages ?? []).some(
    (image) => !!image['@odata.id'],
  );
}

/**
 * When several cards share a BMC/HMC heading, append a Manager Id. Heuristic
 * fallback buckets have no managerId, so use an inventory Id (or the bucket
 * key) instead of leaving one card unsuffixed.
 */
function sectionTitleSuffixForGroup(
  group: {
    managerId: string | undefined;
    key: string;
    firmware: SoftwareInventory[];
  },
  kindCount: number,
): string | undefined {
  if (kindCount <= 1) return undefined;
  return (
    group.managerId ??
    group.firmware.find((item) => item.Id)?.Id ??
    group.key
  );
}

function isErotInventory(Item: SoftwareInventory): boolean {
  const id = (Item.Id ?? '').toUpperCase();
  return (
    id.includes('EROT') ||
    (Item.RelatedItem ?? []).some((related) =>
      (related['@odata.id'] ?? '').toUpperCase().includes('EROT'),
    )
  );
}

function getNvidiaOem(
  Item: SoftwareInventory | undefined,
): NvidiaSoftwareInventoryOem | undefined {
  const oem = Item?.Oem as { Nvidia?: NvidiaSoftwareInventoryOem } | undefined;
  return oem?.Nvidia;
}

function withVersion(
  Item: SoftwareInventory,
  version: string | null | undefined,
): SoftwareInventory {
  if (version == null || version === Item.Version) return Item;
  return { ...Item, Version: version };
}

/**
 * Match BMC (or HGX BMC) firmware inventory entries.
 * Excludes ERoT_* inventory that also contains "BMC" in the Id/RelatedItem.
 */
function matchesBmcInventory(
  Item: SoftwareInventory,
  kind: 'bmc' | 'hmc',
): boolean {
  if (isErotInventory(Item)) return false;

  const identifiers = [
    Item.Id,
    ...(Item.RelatedItem ?? []).map((related) =>
      odataIdTail(related['@odata.id']),
    ),
  ]
    .filter((id): id is string => id != null && id.length > 0)
    .map((id) => id.toUpperCase());

  return identifiers.some((id) => {
    const isSatellite = id.includes('HGX') || id.includes('HMC');
    const isBmc = id.includes('BMC');
    return kind === 'hmc'
      ? isSatellite && (isBmc || id.includes('HMC'))
      : isBmc && !isSatellite;
  });
}

/**
 * Match an inventory item to one Manager without allowing BMC_0 to claim
 * FW_HGX_BMC_0. Redfish implementations commonly prefix firmware Ids with
 * "FW_", while RelatedItem generally uses the Manager Id directly.
 */
function matchesManagerInventory(
  Item: SoftwareInventory,
  managerId: string,
): boolean {
  if (isErotInventory(Item)) return false;

  const expected = managerId.toUpperCase();
  const identifiers = [
    Item.Id,
    ...(Item.RelatedItem ?? []).map((related) =>
      odataIdTail(related['@odata.id']),
    ),
  ]
    .filter((id): id is string => id != null && id.length > 0)
    .map((id) => id.toUpperCase());

  return identifiers.some(
    (id) => id === expected || id.replace(/^FW_/, '') === expected,
  );
}

function inventoryIdsFromManager(manager: Manager | undefined): {
  activeId: string | null;
  softwareImageIds: string[];
} {
  const activeId =
    odataIdTail(manager?.Links?.ActiveSoftwareImage?.['@odata.id']) ?? null;
  const softwareImageIds = (manager?.Links?.SoftwareImages ?? [])
    .map((image) => odataIdTail(image['@odata.id']))
    .filter((id): id is string => id != null && id.length > 0);
  return { activeId, softwareImageIds };
}

function resolveActiveBackup(
  firmware: SoftwareInventory[],
  activeId: string | null | undefined,
): {
  activeFirmware: SoftwareInventory | undefined;
  backupFirmware: SoftwareInventory | undefined;
  activeSlot: NvidiaFirmwareSlot | undefined;
  backupSlot: NvidiaFirmwareSlot | undefined;
  /** True when backup came from Oem.Nvidia.InactiveFirmwareSlot on the same item */
  oemDualSlot: boolean;
} {
  const activeInventory =
    (activeId ? firmware.find((Fw) => Fw.Id === activeId) : undefined) ??
    firmware.find((Fw) => Fw.Active === true) ??
    firmware.find((Fw) => Fw.Staged === false) ??
    firmware[0];

  const nvidiaOem = getNvidiaOem(activeInventory);
  const inactiveSlot = nvidiaOem?.InactiveFirmwareSlot;
  const inactiveVersion = inactiveSlot?.Version;
  const hasOemBackup = inactiveVersion != null && inactiveVersion !== '';
  const activeFirmwareFromOem =
    activeInventory && nvidiaOem?.ActiveFirmwareSlot?.Version
      ? withVersion(activeInventory, nvidiaOem.ActiveFirmwareSlot.Version)
      : activeInventory;

  // Dual-slot OEM is only the backup source when InactiveFirmwareSlot has a
  // version. An ActiveFirmwareSlot alone must not skip staged-image discovery.
  if (activeInventory && hasOemBackup) {
    return {
      activeFirmware: activeFirmwareFromOem,
      backupFirmware: withVersion(activeInventory, inactiveVersion),
      activeSlot: nvidiaOem?.ActiveFirmwareSlot,
      backupSlot: inactiveSlot,
      oemDualSlot: true,
    };
  }

  const resolvedActiveId = activeInventory?.Id;
  const backupInventory = resolvedActiveId
    ? (firmware.find(
        (Fw) => Fw.Id !== resolvedActiveId && Fw.Staged === true,
      ) ?? firmware.find((Fw) => Fw.Id !== resolvedActiveId))
    : firmware.find((Fw) => Fw.Staged === true);
  return {
    activeFirmware: activeFirmwareFromOem,
    backupFirmware: backupInventory,
    activeSlot: nvidiaOem?.ActiveFirmwareSlot,
    backupSlot: undefined,
    oemDualSlot: false,
  };
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

  // Fetch active BMC firmware ID from cached Manager (via GlobalStore)
  const { data: primaryManagerCache, isLoading: isBmcActiveLoading } =
    useQuery({
      queryKey: ['firmware', 'activeBmc'],
      queryFn: async (): Promise<CachedManagerResponse | null> => {
        try {
          return (await store.dispatch(
            'global/getManagerProvidingService',
          )) as CachedManagerResponse;
        } catch {
          return null;
        }
      },
      retry: false,
      staleTime: 30000,
    });

  const BmcActiveFirmwareId = computed(
    () =>
      odataIdTail(
        primaryManagerCache.value?.data?.Links?.ActiveSoftwareImage?.[
          '@odata.id'
        ],
      ) ?? null,
  );

  /** Id of the Manager providing the Redfish service (the primary BMC). */
  const ServiceManagerId = computed(
    () =>
      primaryManagerCache.value?.data?.Id ??
      odataIdTail(primaryManagerCache.value?.data?.['@odata.id']) ??
      null,
  );

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
          .map((image) => odataIdTail(image['@odata.id']))
          .filter((id): id is string => id != null && id.length > 0);

        return {
          activeId:
            odataIdTail(
              response?.Links?.ActiveSoftwareImage?.['@odata.id'],
            ) ?? null,
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

  // All Managers — used to discover primary + HGX/HMC BMCs and their images.
  const { data: managersCollection, isLoading: isManagersLoading } = useQuery({
    ...getGetManagersQueryOptions({
      query: {
        staleTime: 30000,
        retry: false,
      },
    }),
  });

  const managerIds = computed(() =>
    (managersCollection.value?.Members ?? [])
      .map((Member) => odataIdTail(Member['@odata.id']))
      .filter((id): id is string => id != null && id.length > 0),
  );

  // Skip the service Manager only when Vuex already has firmware Links.
  // A cache with just Id/@odata.id still needs GET /Managers/{id}.
  const queriedManagerIds = computed(() => {
    if (isBmcActiveLoading.value) return [];
    const cachedHasLinks = cachedManagerHasLinkedFirmware(
      primaryManagerCache.value?.data,
    );
    return managerIds.value.filter((managerId) => {
      if (managerId !== ServiceManagerId.value) return true;
      return !cachedHasLinks;
    });
  });

  const managerQueries = useQueries({
    queries: computed(() =>
      queriedManagerIds.value.map((managerId) =>
        getGetManagersByIdQueryOptions(managerId, {
          query: {
            staleTime: 30000,
            retry: false,
          },
        }),
      ),
    ),
  });

  const isManagersDetailLoading = computed(() =>
    managerQueries.value.some((query) => query.isLoading || query.isPending),
  );

  const managers = computed(() => {
    const detailsById = new Map<string, Manager>();

    queriedManagerIds.value.forEach((managerId, index) => {
      detailsById.set(
        managerId,
        managerQueries.value[index]?.data ?? placeholderManager(managerId),
      );
    });

    const serviceId = ServiceManagerId.value;
    // Prefer a live GET when the service Manager was queried; Vuex may only
    // have Id/@odata.id and would wipe ActiveSoftwareImage / SoftwareImages.
    if (serviceId && !detailsById.has(serviceId)) {
      detailsById.set(
        serviceId,
        managerFromServiceCache(primaryManagerCache.value?.data, serviceId),
      );
    }

    // Preserve collection order, including the skipped service Manager.
    return managerIds.value.map(
      (managerId) => detailsById.get(managerId) ?? placeholderManager(managerId),
    );
  });

  // Heuristic BMC inventory buckets (ERoT excluded). Used as fallback when a
  // Manager does not advertise SoftwareImages / ActiveSoftwareImage.
  const BmcFirmwareHeuristic = computed<SoftwareInventory[]>(() => {
    const Members = data.value?.Members ?? [];
    return Members.filter((Item) => matchesBmcInventory(Item, 'bmc'));
  });

  const SatelliteBmcFirmwareHeuristic = computed<SoftwareInventory[]>(() => {
    const Members = data.value?.Members ?? [];
    return Members.filter((Item) => matchesBmcInventory(Item, 'hmc'));
  });

  function firmwareForManager(
    manager: Manager,
    managerId: string,
    kind: 'bmc' | 'hmc',
  ): {
    firmware: SoftwareInventory[];
    activeId: string | null;
  } {
    const Members = data.value?.Members ?? [];
    const { activeId, softwareImageIds } = inventoryIdsFromManager(manager);
    const linkedIds = new Set(
      [activeId, ...softwareImageIds].filter(
        (id): id is string => id != null && id.length > 0,
      ),
    );

    const matched = Members.filter((Item) =>
      matchesManagerInventory(Item, managerId),
    );

    // Keep RelatedItem / FW_${managerId} matches even when SoftwareImages is
    // incomplete (e.g. only ActiveSoftwareImage is populated).
    if (linkedIds.size > 0) {
      const linkedOrMatched = Members.filter(
        (Item) =>
          Item.Id != null &&
          !isErotInventory(Item) &&
          (linkedIds.has(Item.Id) || matchesManagerInventory(Item, managerId)),
      );
      if (linkedOrMatched.length > 0) {
        return { firmware: linkedOrMatched, activeId };
      }
    }

    // Fallback only to inventory associated with this exact manager. Returning
    // the whole kind bucket duplicates images across unlinked managers.
    return {
      firmware: matched,
      activeId:
        activeId ?? (kind === 'bmc' ? BmcActiveFirmwareId.value : null),
    };
  }

  // Host BIOS/UEFI images linked from System/Bios SoftwareImages only.
  const BiosFirmware = computed<SoftwareInventory[]>(() => {
    const imageIds = BiosSoftwareImageIds.value;
    if (imageIds.length === 0) return [];
    const idSet = new Set(imageIds);
    const Members = data.value?.Members ?? [];
    return Members.filter((Item) => Item.Id != null && idSet.has(Item.Id));
  });

  // One card section per Manager that has firmware, so every BMC in
  // /redfish/v1/Managers is represented rather than a fixed BMC/HMC pair.
  const BmcGroups = computed<BmcFirmwareGroup[]>(() => {
    const rawGroups: {
      key: string;
      managerId: string | undefined;
      kind: 'bmc' | 'hmc';
      isServiceManager: boolean;
      firmware: SoftwareInventory[];
      activeId: string | null;
    }[] = [];

    const claimedInventoryIds = new Set<string>();
    const seenManagerIds = new Set<string>();

    for (const manager of managers.value) {
      const managerId =
        manager.Id ?? odataIdTail(manager['@odata.id']) ?? undefined;
      if (!managerId || seenManagerIds.has(managerId)) continue;

      const kind = managerKind(managerId);
      const { firmware, activeId } = firmwareForManager(
        manager,
        managerId,
        kind,
      );
      if (firmware.length === 0) continue;

      seenManagerIds.add(managerId);
      for (const Item of firmware) {
        if (Item.Id) claimedInventoryIds.add(Item.Id);
      }
      rawGroups.push({
        key: managerId,
        managerId,
        kind,
        isServiceManager: managerId === ServiceManagerId.value,
        firmware,
        activeId,
      });
    }

    // Cover BMCs the Managers collection didn't describe — either it failed
    // entirely or one manager's detail fetch did.
    const unclaimed = (items: SoftwareInventory[]) =>
      items.filter((Item) => !Item.Id || !claimedInventoryIds.has(Item.Id));

    const unclaimedBmc = unclaimed(BmcFirmwareHeuristic.value);
    if (unclaimedBmc.length > 0) {
      rawGroups.push({
        key: 'bmc',
        managerId: undefined,
        kind: 'bmc',
        isServiceManager: rawGroups.length === 0,
        firmware: unclaimedBmc,
        activeId: BmcActiveFirmwareId.value,
      });
    }

    const unclaimedHmc = unclaimed(SatelliteBmcFirmwareHeuristic.value);
    if (unclaimedHmc.length > 0) {
      rawGroups.push({
        key: 'hmc',
        managerId: undefined,
        kind: 'hmc',
        isServiceManager: false,
        firmware: unclaimedHmc,
        activeId: null,
      });
    }

    // Primary BMC first, then satellites in collection order.
    const orderedGroups = [
      ...rawGroups.filter((group) => group.isServiceManager),
      ...rawGroups.filter((group) => !group.isServiceManager),
    ];
    if (!orderedGroups.some((group) => group.isServiceManager)) {
      const firstBmc = orderedGroups.find((group) => group.kind === 'bmc');
      if (firstBmc) firstBmc.isServiceManager = true;
    }

    // Only spell out which manager a card belongs to when the heading alone
    // would be ambiguous (e.g. two BMCs, or a BMC plus an unlinked fallback).
    const kindCounts = orderedGroups.reduce<Record<string, number>>(
      (counts, group) => {
        counts[group.kind] = (counts[group.kind] ?? 0) + 1;
        return counts;
      },
      {},
    );

    return orderedGroups.map((group) => {
      const {
        activeFirmware,
        backupFirmware,
        activeSlot,
        backupSlot,
        oemDualSlot,
      } = resolveActiveBackup(group.firmware, group.activeId);

      // OpenBMC switch patches ActiveSoftwareImage to a distinct backup image.
      // NVIDIA dual-slot OEM keeps both versions on one inventory URI.
      const switchSupported =
        group.isServiceManager &&
        !oemDualSlot &&
        !!backupFirmware &&
        backupFirmware['@odata.id'] !== activeFirmware?.['@odata.id'];

      return {
        key: group.key,
        managerId: group.managerId,
        sectionTitleKey:
          group.kind === 'hmc'
            ? 'pageFirmware.sectionTitleHmcCards'
            : 'pageFirmware.sectionTitleBmcCards',
        sectionTitleSuffix: sectionTitleSuffixForGroup(
          group,
          kindCounts[group.kind] ?? 0,
        ),
        isServiceManager: group.isServiceManager,
        firmware: group.firmware,
        activeFirmware,
        backupFirmware,
        activeSlot,
        backupSlot,
        switchSupported,
      };
    });
  });

  const ServiceBmcGroup = computed(
    () =>
      BmcGroups.value.find((group) => group.isServiceManager) ??
      BmcGroups.value[0],
  );

  const BmcFirmware = computed(() => ServiceBmcGroup.value?.firmware ?? []);

  const isSingleFileUploadEnabled = computed(
    () => BiosFirmware.value.length === 0,
  );

  const ActiveBmcFirmware = computed(
    () => ServiceBmcGroup.value?.activeFirmware,
  );

  const ActiveBiosFirmware = computed(() => {
    if (BiosFirmware.value.length === 0) return undefined;
    return (
      BiosFirmware.value.find((Fw) => Fw.Id === BiosActiveFirmwareId.value) ??
      BiosFirmware.value[0]
    );
  });

  const BackupBmcFirmware = computed(
    () => ServiceBmcGroup.value?.backupFirmware,
  );

  const BackupBiosFirmware = computed(() => {
    const activeId = ActiveBiosFirmware.value?.Id;
    if (!activeId) return undefined;
    return BiosFirmware.value.find((Fw) => Fw.Id !== activeId);
  });

  const isBiosFirmwareAvailable = computed(
    () =>
      BiosSoftwareImageIds.value.length > 0 && BiosFirmware.value.length > 0,
  );

  const isLoading = computed(
    () =>
      isInventoryLoading.value ||
      isBmcActiveLoading.value ||
      isBiosActiveLoading.value ||
      isManagersLoading.value ||
      isManagersDetailLoading.value,
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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defineComponent, ref, nextTick } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';

const { managerByIdRequests, serviceManagerPayload, managerByIdOverrides } =
  vi.hoisted(() => ({
    managerByIdRequests: /** @type {string[]} */ ([]),
    serviceManagerPayload: { current: null },
    managerByIdOverrides: { current: {} },
  }));

// Three managers whose Ids do not follow the BMC_0/HGX_BMC_0 convention:
// a second plain BMC and a satellite named HMC_0 rather than HGX_*.
const MANAGERS = {
  Members: [
    { '@odata.id': '/redfish/v1/Managers/BMC_0' },
    { '@odata.id': '/redfish/v1/Managers/BMC_1' },
    { '@odata.id': '/redfish/v1/Managers/HMC_0' },
    { '@odata.id': '/redfish/v1/Managers/AUXILIARY_0' },
  ],
};

const managerFixture = (id, firmwareId) => ({
  '@odata.id': `/redfish/v1/Managers/${id}`,
  Id: id,
  Links: {
    ActiveSoftwareImage: {
      '@odata.id': `/redfish/v1/UpdateService/FirmwareInventory/${firmwareId}`,
    },
    SoftwareImages: [
      {
        '@odata.id': `/redfish/v1/UpdateService/FirmwareInventory/${firmwareId}`,
      },
    ],
  },
});

const MANAGER_BY_ID = {
  BMC_0: managerFixture('BMC_0', 'FW_BMC_0'),
  // BMC_1 intentionally omits SoftwareImages to exercise manager-scoped
  // RelatedItem/Id fallback.
  BMC_1: {
    '@odata.id': '/redfish/v1/Managers/BMC_1',
    Id: 'BMC_1',
  },
  AUXILIARY_0: {
    '@odata.id': '/redfish/v1/Managers/AUXILIARY_0',
    Id: 'AUXILIARY_0',
  },
};

const inventoryFixture = (id, version, chassis, extra = {}) => ({
  '@odata.id': `/redfish/v1/UpdateService/FirmwareInventory/${id}`,
  Id: id,
  Version: version,
  RelatedItem: [{ '@odata.id': `/redfish/v1/Chassis/${chassis}` }],
  ...extra,
});

const INVENTORY_MEMBERS = [
  inventoryFixture('FW_BMC_0', '1.0.0', 'BMC_0'),
  // Present in inventory and RelatedItem, but omitted from BMC_0 SoftwareImages.
  inventoryFixture('FW_BMC_0_BACKUP', '0.9.0', 'BMC_0'),
  // Staged image listed first so collection order is not the active/backup
  // contract. BMC_1 has no Links.SoftwareImages / ActiveSoftwareImage.
  inventoryFixture('FW_BMC_1_BACKUP', '1.9.0', 'BMC_1', {
    Active: false,
    Staged: true,
  }),
  inventoryFixture('FW_BMC_1', '2.0.0', 'BMC_1', {
    Active: true,
    Staged: false,
    // Active slot without an inactive version must not hide the staged image.
    Oem: {
      Nvidia: {
        ActiveFirmwareSlot: {
          Version: '2.0.0-slot',
          FirmwareState: 'Activated',
          SlotId: 0,
        },
      },
    },
  }),
  inventoryFixture('FW_HMC_0', '3.0.0', 'HMC_0'),
  // Matches the BMC keyword heuristic but is not linked to any Manager, so it
  // lands in the key:'bmc' fallback bucket beside BMC_0 / BMC_1.
  inventoryFixture('FW_BMC_UNLINKED', '0.1.0', 'UNLINKED_BMC'),
];

vi.mock('@/api/composables/useRedfishCollection', () => ({
  useRedfishCollection: () => ({
    data: ref({ Members: INVENTORY_MEMBERS }),
    isLoading: ref(false),
    error: ref(null),
    refetch: vi.fn(),
  }),
}));

vi.mock('@/api/endpoints/redfish.gen', () => ({
  getGetManagersQueryOptions: (options) => ({
    queryKey: ['Managers'],
    queryFn: () => Promise.resolve(MANAGERS),
    ...(options?.query ?? {}),
  }),
  getGetManagersByIdQueryOptions: (managerId, options) => ({
    queryKey: ['Managers', managerId],
    // A failed HMC detail request must still use the Id from the Managers
    // collection to discover FW_HMC_0.
    queryFn: () => {
      managerByIdRequests.push(managerId);
      if (managerId === 'HMC_0') {
        return Promise.reject(new Error('manager detail unavailable'));
      }
      return Promise.resolve(
        managerByIdOverrides.current[managerId] ?? MANAGER_BY_ID[managerId],
      );
    },
    ...(options?.query ?? {}),
  }),
}));

vi.mock('@/api/mutator/axios-instance', () => ({
  apiInstance: vi.fn(() => Promise.reject(new Error('no bios'))),
}));

vi.mock('@/store', () => ({
  default: {
    dispatch: vi.fn((action) =>
      action === 'global/getManagerProvidingService'
        ? Promise.resolve(serviceManagerPayload.current)
        : Promise.resolve(null),
    ),
  },
}));

import { useFirmwareInventory } from '@/api/composables/useFirmwareInventory';

async function mountComposable() {
  const result = {};
  const TestComponent = defineComponent({
    setup() {
      Object.assign(result, useFirmwareInventory());
      return () => null;
    },
  });

  mount(TestComponent, {
    global: {
      plugins: [
        [
          VueQueryPlugin,
          {
            queryClient: new QueryClient({
              defaultOptions: { queries: { retry: false } },
            }),
          },
        ],
      ],
    },
  });

  for (let i = 0; i < 20; i++) {
    await flushPromises();
    await nextTick();
    if ((result.BmcGroups?.value?.length ?? 0) === 4) break;
    if (i === 19) throw new Error('Timed out waiting for BmcGroups');
  }

  return result;
}

describe('useFirmwareInventory manager discovery', () => {
  beforeEach(() => {
    managerByIdRequests.length = 0;
    serviceManagerPayload.current = { data: MANAGER_BY_ID.BMC_0 };
    managerByIdOverrides.current = {};
  });

  it('shows a section for every manager that has firmware', async () => {
    const { BmcGroups } = await mountComposable();

    expect(
      BmcGroups.value.filter((group) => group.managerId).map((group) => group.key),
    ).toEqual(['BMC_0', 'BMC_1', 'HMC_0']);
    expect(BmcGroups.value.map((group) => group.activeFirmware?.Version)).toEqual(
      ['1.0.0', '2.0.0-slot', '3.0.0', '0.1.0'],
    );
  });

  it('does not refetch the service manager already loaded via Vuex', async () => {
    await mountComposable();

    expect(managerByIdRequests).not.toContain('BMC_0');
    expect(managerByIdRequests).toEqual(
      expect.arrayContaining(['BMC_1', 'HMC_0', 'AUXILIARY_0']),
    );
  });

  it('fetches the service manager when Vuex cache has no firmware Links', async () => {
    serviceManagerPayload.current = {
      data: {
        '@odata.id': '/redfish/v1/Managers/BMC_0',
        Id: 'BMC_0',
      },
    };
    // Point ActiveSoftwareImage at the backup Id so a cache overwrite (no
    // Links) would still pick FW_BMC_0 from collection order, while a live
    // GET uses this link.
    managerByIdOverrides.current.BMC_0 = {
      ...MANAGER_BY_ID.BMC_0,
      Links: {
        ...MANAGER_BY_ID.BMC_0.Links,
        ActiveSoftwareImage: {
          '@odata.id':
            '/redfish/v1/UpdateService/FirmwareInventory/FW_BMC_0_BACKUP',
        },
      },
    };

    const { BmcGroups } = await mountComposable();

    expect(managerByIdRequests).toContain('BMC_0');
    const primary = BmcGroups.value.find((group) => group.key === 'BMC_0');
    expect(primary.activeFirmware?.Id).toBe('FW_BMC_0_BACKUP');
  });

  it('labels a non-HGX satellite manager as HMC', async () => {
    const { BmcGroups } = await mountComposable();

    const hmc = BmcGroups.value.find((group) => group.key === 'HMC_0');
    expect(hmc.sectionTitleKey).toBe('pageFirmware.sectionTitleHmcCards');
    expect(hmc.sectionTitleSuffix).toBeUndefined();
  });

  it('disambiguates manager and heuristic-fallback BMC headings', async () => {
    const { BmcGroups } = await mountComposable();

    const bmcGroups = BmcGroups.value.filter(
      (group) => group.sectionTitleKey === 'pageFirmware.sectionTitleBmcCards',
    );
    expect(bmcGroups.map((group) => group.sectionTitleSuffix)).toEqual([
      'BMC_0',
      'BMC_1',
      'FW_BMC_UNLINKED',
    ]);
  });

  it('does not assign one firmware image to more than one manager', async () => {
    const { BmcGroups } = await mountComposable();

    const ids = BmcGroups.value.flatMap((group) =>
      group.firmware.map((item) => item.Id),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('does not invent a firmware section for an unrelated manager', async () => {
    const { BmcGroups } = await mountComposable();

    expect(BmcGroups.value.some((group) => group.key === 'AUXILIARY_0')).toBe(
      false,
    );
  });

  it('keeps RelatedItem firmware when SoftwareImages omits the backup', async () => {
    const { BmcGroups } = await mountComposable();

    const primary = BmcGroups.value.find((group) => group.key === 'BMC_0');
    expect(primary.firmware.map((item) => item.Id)).toEqual([
      'FW_BMC_0',
      'FW_BMC_0_BACKUP',
    ]);
    expect(primary.activeFirmware?.Version).toBe('1.0.0');
    expect(primary.backupFirmware?.Version).toBe('0.9.0');
  });

  it('prefers Active and Staged over inventory collection order', async () => {
    const { BmcGroups } = await mountComposable();

    const secondary = BmcGroups.value.find((group) => group.key === 'BMC_1');
    expect(secondary.firmware[0].Id).toBe('FW_BMC_1_BACKUP');
    expect(secondary.activeFirmware?.Version).toBe('2.0.0-slot');
    expect(secondary.backupFirmware?.Version).toBe('1.9.0');
  });

  it('uses staged backup when OEM inactive slot has no version', async () => {
    const { BmcGroups } = await mountComposable();

    const secondary = BmcGroups.value.find((group) => group.key === 'BMC_1');
    expect(secondary.activeSlot).toMatchObject({
      SlotId: 0,
      FirmwareState: 'Activated',
    });
    expect(secondary.backupSlot).toBeUndefined();
    expect(secondary.backupFirmware?.Id).toBe('FW_BMC_1_BACKUP');
    expect(secondary.switchSupported).toBe(false);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defineComponent, ref, nextTick } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';

// Fixtures mirror a dual-BMC NVIDIA platform (tray BMC_0 + HGX_BMC_0), where
// firmware versions live in Oem.Nvidia slots and ERoT entries also carry "BMC"
// in their Id.
const MANAGERS = {
  '@odata.id': '/redfish/v1/Managers',
  Members: [
    { '@odata.id': '/redfish/v1/Managers/BMC_0' },
    { '@odata.id': '/redfish/v1/Managers/HGX_BMC_0' },
  ],
};

const MANAGER_BY_ID = {
  BMC_0: {
    '@odata.id': '/redfish/v1/Managers/BMC_0',
    Id: 'BMC_0',
    FirmwareVersion: 'VRB-2601-28.00',
    Links: {
      ActiveSoftwareImage: {
        '@odata.id': '/redfish/v1/UpdateService/FirmwareInventory/FW_BMC_0',
      },
      SoftwareImages: [
        { '@odata.id': '/redfish/v1/UpdateService/FirmwareInventory/FW_BMC_0' },
      ],
    },
  },
  HGX_BMC_0: {
    '@odata.id': '/redfish/v1/Managers/HGX_BMC_0',
    Id: 'HGX_BMC_0',
    FirmwareVersion: 'VRH-2604-00.00',
    Links: {
      ActiveSoftwareImage: {
        '@odata.id': '/redfish/v1/UpdateService/FirmwareInventory/HGX_FW_BMC_0',
      },
      SoftwareImages: [
        {
          '@odata.id':
            '/redfish/v1/UpdateService/FirmwareInventory/HGX_FW_BMC_0',
        },
      ],
    },
  },
};

const INVENTORY_MEMBERS = [
  {
    '@odata.id': '/redfish/v1/UpdateService/FirmwareInventory/FW_BMC_0',
    Id: 'FW_BMC_0',
    Version: 'VRB-2601-28.00',
    RelatedItem: [{ '@odata.id': '/redfish/v1/Chassis/BMC_0' }],
    Updateable: true,
    Oem: {
      Nvidia: {
        ActiveFirmwareSlot: {
          BuildType: 'Release',
          FirmwareComparisonNumber: 637609984,
          FirmwareState: 'Activated',
          SlotId: 0,
          Version: 'VRB-2601-28.00',
        },
        InactiveFirmwareSlot: {
          BuildType: 'Release',
          FirmwareComparisonNumber: 2491440,
          FirmwareState: 'ImageCopyPending',
          SlotId: 1,
          Version: 'shengchihc',
        },
      },
    },
  },
  {
    '@odata.id': '/redfish/v1/UpdateService/FirmwareInventory/FW_ERoT_BMC_0',
    Id: 'FW_ERoT_BMC_0',
    Version: '02.00.0023.0000_n05',
    RelatedItem: [{ '@odata.id': '/redfish/v1/Chassis/ERoT_BMC_0' }],
  },
  {
    '@odata.id': '/redfish/v1/UpdateService/FirmwareInventory/HGX_FW_BMC_0',
    Id: 'HGX_FW_BMC_0',
    Version: 'VRH-2604-00.00',
    RelatedItem: [{ '@odata.id': '/redfish/v1/Chassis/HGX_BMC_0' }],
    Oem: {
      Nvidia: {
        ActiveFirmwareSlot: {
          BuildType: 'Release',
          FirmwareState: 'Activated',
          SlotId: 1,
          Version: 'VRH-2604-00.00',
        },
        InactiveFirmwareSlot: {
          BuildType: 'Release',
          FirmwareState: 'ImageCopyPending',
          SlotId: 0,
          Version: 'VRHN-2604-29.0',
        },
      },
    },
  },
  {
    '@odata.id':
      '/redfish/v1/UpdateService/FirmwareInventory/HGX_FW_ERoT_BMC_0',
    Id: 'HGX_FW_ERoT_BMC_0',
    Version: '02.00.0023.0000_n05',
    RelatedItem: [{ '@odata.id': '/redfish/v1/Chassis/HGX_ERoT_BMC_0' }],
  },
  {
    '@odata.id': '/redfish/v1/UpdateService/FirmwareInventory/FW_CX_0',
    Id: 'FW_CX_0',
    Version: '82.48.1304',
    RelatedItem: [{ '@odata.id': '/redfish/v1/Chassis/CX_0' }],
  },
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
    queryFn: () => Promise.resolve(MANAGER_BY_ID[managerId]),
    ...(options?.query ?? {}),
  }),
}));

vi.mock('@/api/mutator/axios-instance', () => ({
  apiInstance: vi.fn(() => Promise.reject(new Error('no bios'))),
}));

vi.mock('@/store', () => ({
  default: {
    dispatch: vi.fn((action) => {
      if (action === 'global/getManagerProvidingService') {
        return Promise.resolve({ data: MANAGER_BY_ID.BMC_0 });
      }
      return Promise.resolve(null);
    }),
  },
}));

import { useFirmwareInventory } from '@/api/composables/useFirmwareInventory';

async function mountComposable() {
  const result = {};
  const waitForReady = async (maxTries = 20) => {
    for (let i = 0; i < maxTries; i++) {
      await flushPromises();
      await nextTick();
      if ((result.BmcGroups?.value?.length ?? 0) > 0) return;
    }
    throw new Error('Timed out waiting for BmcGroups');
  };

  const TestComponent = defineComponent({
    setup() {
      Object.assign(result, useFirmwareInventory());
      return () => null;
    },
  });

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  mount(TestComponent, {
    global: { plugins: [[VueQueryPlugin, { queryClient }]] },
  });

  await waitForReady();

  return result;
}

describe('useFirmwareInventory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds a card group for every BMC manager', async () => {
    const { BmcGroups } = await mountComposable();

    expect(BmcGroups.value.map((group) => group.key)).toEqual([
      'BMC_0',
      'HGX_BMC_0',
    ]);
    expect(BmcGroups.value.map((group) => group.sectionTitleKey)).toEqual([
      'pageFirmware.sectionTitleBmcCards',
      'pageFirmware.sectionTitleHmcCards',
    ]);
  });

  it('marks the manager providing the service as the primary BMC', async () => {
    const { BmcGroups } = await mountComposable();

    expect(BmcGroups.value.map((group) => group.isServiceManager)).toEqual([
      true,
      false,
    ]);
  });

  it('reads running and backup versions from the NVIDIA firmware slots', async () => {
    const { BmcGroups } = await mountComposable();

    const [primary, hmc] = BmcGroups.value;
    expect(primary.managerId).toBe('BMC_0');
    expect(hmc.managerId).toBe('HGX_BMC_0');
    expect(primary.activeFirmware?.Version).toBe('VRB-2601-28.00');
    expect(primary.backupFirmware?.Version).toBe('shengchihc');
    expect(hmc.activeFirmware?.Version).toBe('VRH-2604-00.00');
    expect(hmc.backupFirmware?.Version).toBe('VRHN-2604-29.0');
  });

  it('exposes the slot details behind the expand toggle', async () => {
    const { BmcGroups } = await mountComposable();

    const [primary] = BmcGroups.value;
    expect(primary.activeSlot).toMatchObject({
      SlotId: 0,
      FirmwareState: 'Activated',
      BuildType: 'Release',
      FirmwareComparisonNumber: 637609984,
    });
    expect(primary.backupSlot).toMatchObject({
      SlotId: 1,
      FirmwareState: 'ImageCopyPending',
    });
  });

  it('never treats ERoT images as BMC backup images', async () => {
    const { BmcGroups } = await mountComposable();

    for (const group of BmcGroups.value) {
      expect(group.backupFirmware?.Version).not.toBe('02.00.0023.0000_n05');
      for (const item of group.firmware) {
        expect(item.Id).not.toContain('ERoT');
      }
    }
  });

  it('disables switch-to-running for OEM dual-slot inventory', async () => {
    const { BmcGroups } = await mountComposable();

    expect(BmcGroups.value.every((group) => !group.switchSupported)).toBe(true);
  });
});

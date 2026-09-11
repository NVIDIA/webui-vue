import { describe, it, expect, vi } from 'vitest';
import { defineComponent, nextTick } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';

// Same fixtures as useFirmwareInventory.spec.js, but served through the real
// generated endpoints + useRedfishCollection so the query wiring (including the
// computed `enabled` inside getGetManagersByIdQueryOptions) is exercised.
const RESPONSES = {
  '/redfish/v1/': {
    '@odata.id': '/redfish/v1/',
    ProtocolFeaturesSupported: { ExpandQuery: { MaxLevels: 2 } },
  },
  '/redfish/v1/Managers': {
    Members: [
      { '@odata.id': '/redfish/v1/Managers/BMC_0' },
      { '@odata.id': '/redfish/v1/Managers/HGX_BMC_0' },
    ],
  },
  '/redfish/v1/Managers/BMC_0': {
    Id: 'BMC_0',
    Links: {
      ActiveSoftwareImage: {
        '@odata.id': '/redfish/v1/UpdateService/FirmwareInventory/FW_BMC_0',
      },
      SoftwareImages: [
        { '@odata.id': '/redfish/v1/UpdateService/FirmwareInventory/FW_BMC_0' },
      ],
    },
  },
  '/redfish/v1/Managers/HGX_BMC_0': {
    Id: 'HGX_BMC_0',
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

const INVENTORY = {
  '@odata.id': '/redfish/v1/UpdateService/FirmwareInventory',
  Members: [
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
            FirmwareState: 'Activated',
            SlotId: 0,
            Version: 'VRB-2601-28.00',
          },
          InactiveFirmwareSlot: {
            BuildType: 'Release',
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
  ],
};

vi.mock('@/api/mutator/axios-instance', () => ({
  apiInstance: vi.fn(({ url }) => {
    if (url.startsWith('/redfish/v1/UpdateService/FirmwareInventory')) {
      return Promise.resolve(INVENTORY);
    }
    const [path] = url.split('?');
    if (RESPONSES[path]) return Promise.resolve(RESPONSES[path]);
    return Promise.reject(new Error(`unexpected url ${url}`));
  }),
}));

vi.mock('@/store', () => ({
  default: {
    dispatch: vi.fn((action) => {
      if (action === 'global/getManagerProvidingService') {
        return Promise.resolve({ data: RESPONSES['/redfish/v1/Managers/BMC_0'] });
      }
      return Promise.resolve(null);
    }),
  },
}));

import { useFirmwareInventory } from '@/api/composables/useFirmwareInventory';

describe('useFirmwareInventory (real query wiring)', () => {
  it('produces both BMC groups through the generated query options', async () => {
    const result = {};
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

    for (let i = 0; i < 20; i++) {
      await flushPromises();
      await nextTick();
      if ((result.BmcGroups?.value?.length ?? 0) === 2) break;
      if (i === 19) throw new Error('Timed out waiting for BmcGroups');
    }

    expect(result.BmcGroups.value.map((group) => group.key)).toEqual([
      'BMC_0',
      'HGX_BMC_0',
    ]);
    expect(result.BmcGroups.value[0].activeFirmware?.Version).toBe(
      'VRB-2601-28.00',
    );
    expect(result.BmcGroups.value[1].activeFirmware?.Version).toBe(
      'VRH-2604-00.00',
    );
  });
});

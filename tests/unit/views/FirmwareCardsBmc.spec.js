import { describe, it, expect, vi } from 'vitest';
import { computed } from 'vue';
import { mount } from '@vue/test-utils';
import {
  createBootstrap,
  BButton,
  BCard,
  BCol,
  BRow,
} from 'bootstrap-vue-next';

const BMC_GROUPS = [
  {
    key: 'primary',
    sectionTitleKey: 'pageFirmware.sectionTitleBmcCards',
    firmware: [],
    activeFirmware: { Version: 'VRB-2601-28.00' },
    backupFirmware: { Version: 'shengchihc' },
    activeSlot: {
      BuildType: 'Release',
      FirmwareComparisonNumber: 637609984,
      FirmwareState: 'Activated',
      SlotId: 0,
      Version: 'VRB-2601-28.00',
    },
    backupSlot: {
      BuildType: 'Release',
      FirmwareComparisonNumber: 2491440,
      FirmwareState: 'ImageCopyPending',
      SlotId: 1,
      Version: 'shengchihc',
    },
    switchSupported: false,
  },
];

vi.mock('@/api/composables/useFirmwareInventory', () => ({
  useFirmwareInventory: () => ({
    BmcGroups: computed(() => BMC_GROUPS),
    isSingleFileUploadEnabled: computed(() => true),
  }),
}));

vi.mock('@/store', () => ({
  default: { dispatch: vi.fn(() => Promise.resolve()), commit: vi.fn() },
}));

import FirmwareCardsBmc from '@/views/Operations/Firmware/FirmwareCardsBmc.vue';

function mountCards() {
  return mount(FirmwareCardsBmc, {
    props: { isPageDisabled: false, isServerOff: true },
    global: {
      plugins: [createBootstrap()],
      // Use the real bootstrap components instead of the global test stubs so
      // the card markup is exercised the way the browser sees it.
      components: { BButton, BBtn: BButton, BCard, BCol, BRow },
      stubs: {
        'b-button': false,
        'b-btn': false,
        'page-section': { template: '<section><slot/></section>' },
        'status-icon': true,
        'modal-switch-to-running': true,
      },
      mocks: {
        $store: { dispatch: vi.fn(() => Promise.resolve()) },
      },
    },
  });
}

describe('FirmwareCardsBmc', () => {
  it('renders the BMC cards without runtime errors', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const wrapper = mountCards();

      expect(wrapper.text()).toContain('VRB-2601-28.00');
      expect(wrapper.text()).toContain('shengchihc');

      const messages = [...errorSpy.mock.calls, ...warnSpy.mock.calls]
        .map((args) => String(args[0]))
        .filter((message) => !message.includes('Failed to resolve directive'));
      expect(messages).toEqual([]);
    } finally {
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  it('shows an expand toggle for each image with slot details', () => {
    const wrapper = mountCards();

    expect(
      wrapper
        .find(
          '[data-test-id="firmware-button-expandRunningSlot-primary"]',
        )
        .exists(),
    ).toBe(true);
    expect(
      wrapper
        .find('[data-test-id="firmware-button-expandBackupSlot-primary"]')
        .exists(),
    ).toBe(true);
  });

  it('keeps the slot values hidden until the toggle is clicked', async () => {
    const wrapper = mountCards();
    const details = wrapper.find('#firmware-slot-details-primary-running');
    const toggle = wrapper.find(
      '[data-test-id="firmware-button-expandRunningSlot-primary"]',
    );

    expect(details.exists()).toBe(true);
    expect(details.attributes('style')).toContain('display: none');
    expect(toggle.attributes('aria-expanded')).toBe('false');

    await toggle.trigger('click');

    expect(details.attributes('style') ?? '').not.toContain('display: none');
    expect(toggle.attributes('aria-expanded')).toBe('true');
    expect(details.text()).toContain('Activated');
    expect(details.text()).toContain('Release');
    expect(details.text()).toContain('637609984');
  });
});

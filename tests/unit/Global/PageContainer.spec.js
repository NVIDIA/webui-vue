import { vi, describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PageContainer from '@/components/Global/PageContainer';

// Mock the ManagerStatusService to prevent store dispatch calls
vi.mock('@/services/ManagerStatusService', () => ({
  startManagerStatusCheck: vi.fn(() => 123),
  stopManagerStatusCheck: vi.fn(),
}));

vi.mock('@/services/ToastOffsetService', () => ({
  observeAppBannerStack: vi.fn(() => ({ disconnect: vi.fn() })),
}));

describe('PageContainer.vue', () => {
  const wrapper = mount(PageContainer, {
    global: {
      mocks: {
        $t: (key) => key,
        $route: { path: '/' },
        $store: {
          state: {
            bmc: {
              isManagerReady: true,
            },
          },
          getters: {
            'global/recoveryInProgress': false,
            'global/recoveryTimedOut': false,
            'firmware/isFirmwareUpdateInProgress': false,
            'firmware/firmwareUpdateInfo': { taskPercent: 0, state: null },
          },
          dispatch: vi.fn(() => Promise.resolve()),
        },
        $eventBus: {
          on: vi.fn(),
          off: vi.fn(),
        },
      },
      stubs: {
        GlobalBanner: true,
        BootProgressBanner: true,
        FirmwareProgressBanner: true,
        SystemRecoveryModal: true,
      },
    },
  });

  it('should exist', () => {
    expect(wrapper.exists()).toBe(true);
  });

  it('should render main element', () => {
    expect(wrapper.find('main').exists()).toBe(true);
  });

  it('should render correctly', () => {
    expect(wrapper.element).toMatchSnapshot();
  });
});
